import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  telegramLinkCodes,
  authUsers,
  participantProfile,
} from "@/db/schema/rail2";
import { rail1Users } from "@/db/schema/rail1";

const TELEGRAM_LINK_CODE_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_BOT_CONNECT_POINTS = 50;

export async function getOrCreateUserByPrivyDid(privyDid: string) {
  const existing = await db.query.authUsers.findFirst({
    where: eq(authUsers.privyDid, privyDid),
    with: {
      participantProfile: true,
    },
  });

  if (existing) return existing;

  try {
    return db.transaction(async (tx) => {
      const [user] = await tx
        .insert(authUsers)
        .values({
          privyDid,
        })
        .onConflictDoNothing({ target: authUsers.privyDid })
        .returning();

      if (!user) {
        const winner = await tx.query.authUsers.findFirst({
          where: eq(authUsers.privyDid, privyDid),
          with: { participantProfile: true },
        });
        if (!winner) {
          throw new Error(`Race lost and user still missing for ${privyDid}`);
        }
        return winner;
      }

      const [profile] = await tx
        .insert(participantProfile)
        .values({
          userId: user.id,
        })
        .returning();

      if (!profile) {
        const existingProfile = await tx.query.participantProfile.findFirst({
          where: eq(participantProfile.userId, user.id),
        });
        if (!existingProfile) {
          throw new Error(
            `Insert into participantProfile returned no row for userId=${user.id}`,
          );
        }
      }

      return {
        ...user,
        participantProfile: profile,
      };
    });
  } catch (err) {
    const recovered = await db.query.authUsers.findFirst({
      where: eq(authUsers.privyDid, privyDid),
      with: { participantProfile: true },
    });
    if (recovered) return recovered;
    throw err;
  }
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

  const user = db.query.authUsers.findFirst({
    where: eq(authUsers.id, profile.userId),
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

    // `alreadyLinked` above only guards the incoming Telegram account —
    // it doesn't stop a user who previously linked a different Telegram
    // account from getting awarded again. Read this user's own current
    // value before the update to tell "first-ever link" apart from
    // "switched to a different Telegram account".
    const targetProfile = await tx.query.participantProfile.findFirst({
      where: eq(participantProfile.userId, linkCode.userId),
    });
    const isFirstLink = !targetProfile?.telegramId;

    await tx
      .update(participantProfile)
      .set({ telegramId: telegramUserId, username: username })
      .where(eq(participantProfile.userId, linkCode.userId));

    await tx
      .update(telegramLinkCodes)
      .set({ consumedAt: new Date() })
      .where(eq(telegramLinkCodes.code, code));

    if (isFirstLink) {
      if (targetProfile?.rail1UserId) {
        // Deliberate cross-boundary write: rail1's `users.total_points` is
        // the same balance every quest claim in bigw-api feeds into. Both
        // services share one Postgres instance (already relied on for the
        // leaderboard join), so this is a direct, same-transaction update
        // rather than a new service call.
        await tx
          .update(rail1Users)
          .set({
            totalPoints: sql`${rail1Users.totalPoints} + ${TELEGRAM_BOT_CONNECT_POINTS}`,
          })
          .where(eq(rail1Users.id, targetProfile.rail1UserId));
      } else {
        // rail1Link() runs on every login (ConnectButton.tsx), but is
        // best-effort — if it never succeeded for this user, we don't know
        // which rail1 row to credit. Telegram linking itself still
        // succeeds; just log so a missed award is discoverable.
        console.warn(
          `Telegram bot connected for userId=${linkCode.userId} but no rail1UserId is linked — skipped the ${TELEGRAM_BOT_CONNECT_POINTS}-point award.`,
        );
      }
    }

    return { ok: true, userId: linkCode.userId } as const;
  });
}

function randomLinkCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
