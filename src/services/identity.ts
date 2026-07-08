import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  telegramLinkCodes,
  users,
  participantProfile,
} from "@/db/schema/bigwater";

const TELEGRAM_LINK_CODE_TTL_MS = 10 * 60 * 1000;
const MEMBER_HEAD_START = 100_000;

export async function getOrCreateUserByPrivyDid(
  privyDid: string,
  opts: { isMember?: boolean } = {},
) {
  const existing = await db.query.users.findFirst({
    where: eq(users.privyDid, privyDid),
  });

  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        privyDid,
      })
      .returning();

    if (!user) {
      throw new Error(
        `Insert into users returned no row for privyDid=${privyDid}`,
      );
    }

    const [profile] = await tx
      .insert(participantProfile)
      .values({
        userId: user.id,
        isMember: opts.isMember ?? false,
        sustainabilityScore: opts.isMember ? MEMBER_HEAD_START : 0,
      })
      .returning();

    if (!profile) {
      throw new Error(
        `Insert into participantProfile returned no row for userId=${user.id}`,
      );
    }

    return user;
  });
}

export async function getParticipantProfileByUserId(userId: string) {
  return db.query.participantProfile.findFirst({
    where: eq(participantProfile.userId, userId),
  });
}

export async function resolveUserByTelegramId(telegramUserId: string) {
  const profile = await db.query.participantProfile.findFirst({
    where: eq(participantProfile.telegramId, telegramUserId),
  });

  if (!profile) return null;

  return db.query.users.findFirst({ where: eq(users.id, profile.userId) });
}

export async function generateTelegramLinkCode(userId: string) {
  const code = randomLinkCode();
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_CODE_TTL_MS);

  await db.insert(telegramLinkCodes).values({ code, userId, expiresAt });

  return { code, expiresAt };
}

type RedeemResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid_or_expired" | "telegram_already_linked" };

export async function redeemTelegramLinkCode(
  code: string,
  telegramUserId: string,
): Promise<RedeemResult> {
  return db.transaction(async (tx) => {
    const linkCode = await tx.query.telegramLinkCodes.findFirst({
      where: eq(telegramLinkCodes.code, code),
    });

    if (
      !linkCode ||
      linkCode.consumedAt !== null ||
      linkCode.expiresAt.getTime() < Date.now()
    ) {
      return { ok: false, reason: "invalid_or_expired" } as const;
    }

    const alreadyLinked = await tx.query.participantProfile.findFirst({
      where: eq(participantProfile.telegramId, telegramUserId),
    });

    if (alreadyLinked) {
      return { ok: false, reason: "telegram_already_linked" } as const;
    }

    await tx
      .update(participantProfile)
      .set({ telegramId: telegramUserId })
      .where(eq(participantProfile.userId, linkCode.userId));

    await tx
      .update(telegramLinkCodes)
      .set({ consumedAt: new Date() })
      .where(eq(telegramLinkCodes.code, code));

    return { ok: true, userId: linkCode.userId } as const;
  });
}

export async function seedAdminsFromEnv() {
  const raw = Bun.env.ADMIN_PRIVY_DIDS;
  if (!raw) return;

  const dids = raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  for (const did of dids) {
    const user = await getOrCreateUserByPrivyDid(did);
    if (user.role !== "admin" && user.role !== "superadmin") {
      await db
        .update(users)
        .set({ role: "admin" })
        .where(eq(users.id, user.id));
    }
  }
}

function randomLinkCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
