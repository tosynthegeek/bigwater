import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  telegramLinkCodes,
  users,
  participantProfile,
} from "@/db/schema/bigwater";

const TELEGRAM_LINK_CODE_TTL_MS = 10 * 60 * 1000;

export async function getOrCreateUserByPrivyDid(privyDid: string) {
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

  if (!profile) {
    console.log("No profile found for user");
    return null;
  }

  const user = db.query.users.findFirst({
    where: eq(users.id, profile.userId),
  });

  return user;
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
  username: string,
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
      .set({ telegramId: telegramUserId, username: username })
      .where(eq(participantProfile.userId, linkCode.userId));

    await tx
      .update(telegramLinkCodes)
      .set({ consumedAt: new Date() })
      .where(eq(telegramLinkCodes.code, code));

    return { ok: true, userId: linkCode.userId } as const;
  });
}

function randomLinkCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
