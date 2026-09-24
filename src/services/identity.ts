import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  telegramLinkCodes,
  authUsers,
  participantProfile,
} from "@/db/schema/rail2";
import { rail1Users } from "@/db/schema/rail1";
import { privy } from "@/privy";
import { verifyRail1Token } from "@/middleware/rail1-jwt";

const TELEGRAM_LINK_CODE_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_BOT_CONNECT_POINTS = 50;

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class Rail1LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Rail1LinkError";
  }
}

export async function getOrCreateUserByPrivyDid(
  privyDid: string,
  rail1Token: string | undefined,
) {
  const existing = await db.query.authUsers.findFirst({
    where: eq(authUsers.privyDid, privyDid),
    with: {
      participantProfile: true,
    },
  });

  if (existing) {
    // Rail1 linking is a member-only concept — an admin/superadmin calling a
    // plain member route (e.g. GET /tasks) resolves through this same
    // privyDid lookup, but must never be forced through the X-Rail1-Token
    // flow just because they (like most admins) have no rail1 account.
    if (existing.role !== "user") {
      return existing;
    }

    if (!existing.participantProfile?.rail1UserId) {
      if (!rail1Token) {
        throw new Rail1LinkError("X-Rail1-Token header required");
      }

      let rail1UserId: string;

      try {
        rail1UserId = await verifyRail1Token(rail1Token);
      } catch {
        throw new Rail1LinkError("Invalid Rail1 token");
      }

      const [updated] = await db
        .update(participantProfile)
        .set({ rail1UserId })
        .where(eq(participantProfile.userId, existing.id))
        .returning();

      if (!updated) {
        throw new AuthenticationError(
          `Update to participantProfile returned no row for userId=${existing.id}`,
        );
      }

      return {
        ...existing,
        participantProfile: updated,
      };
    }

    return existing;
  }

  if (!rail1Token) {
    throw new Rail1LinkError("X-Rail1-Token header required");
  }

  let rail1UserId: string;

  try {
    rail1UserId = await verifyRail1Token(rail1Token);
  } catch {
    throw new Rail1LinkError("Invalid Rail1 token");
  }

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(authUsers)
        .values({
          privyDid,
        })
        .returning();

      if (!user) {
        throw new AuthenticationError(
          `Insert into users returned no row for privyDid=${privyDid}`,
        );
      }

      const [profile] = await tx
        .insert(participantProfile)
        .values({
          userId: user.id,
          rail1UserId,
        })
        .returning();

      if (!profile) {
        throw new AuthenticationError(
          `Insert into participantProfile returned no row for userId=${user.id}`,
        );
      }

      return {
        ...user,
        participantProfile: profile,
      };
    });
  } catch (err) {
    // A new member's first page load fires several authenticated requests at
    // once; each misses the lookup above and races to create the same row.
    // The losers hit auth_accounts_privy_did_unique — return the winner's
    // row instead of failing the request with a 500.
    const recovered = await db.query.authUsers.findFirst({
      where: eq(authUsers.privyDid, privyDid),
      with: { participantProfile: true },
    });
    if (recovered) return recovered;
    throw err;
  }
}

export async function getOrcreateAdminByPrivyDid(privyDid: string) {
  const existing = await db.query.authUsers.findFirst({
    where: eq(authUsers.privyDid, privyDid),
    with: {
      participantProfile: true,
    },
  });

  // This exact Privy DID is already linked to a row, but that row can't
  // actually authenticate as admin — most commonly a previously-revoked
  // admin whose privyDid/email/walletAddress were never cleared (revokeAdmin
  // only flips role/status). Surfacing this here turns "why is my login
  // rejected with no explanation" into a one-line log read instead of a
  // multi-table DB trace.
  if (existing && (existing.role === "user" || existing.status !== "active")) {
    console.warn(
      `[getOrcreateAdminByPrivyDid] Privy DID ${privyDid} resolved to non-admin row ${existing.id} (role=${existing.role}, status=${existing.status}) — login will be rejected. If this admin was recently re-invited, check for an unclaimed placeholder row sharing this identity.`,
    );
  }

  if (existing) return existing;

  try {
    const privyUser = await privy.users()._get(privyDid);
    const userLinkedAccounts = privyUser.linked_accounts;
    const googleAccount = userLinkedAccounts.find(
      (a) => a.type === "google_oauth",
    );
    const walletAccount = userLinkedAccounts.find((a) => a.type === "wallet");
    const email = googleAccount?.email?.toLowerCase();
    const walletAddress = walletAccount?.address?.toLowerCase();
    const candidateIdentifiers = [email, walletAddress].filter(
      (v): v is string => Boolean(v),
    );

    return db.transaction(async (tx) => {
      if (candidateIdentifiers.length < 1) {
        throw new Error(`No admin with id ${privyDid}`);
      }
      const placeholder = await tx.query.authUsers.findFirst({
        where: and(
          inArray(sql`lower(${authUsers.privyDid})`, candidateIdentifiers),
          inArray(authUsers.role, ["admin", "superadmin"]),
        ),
      });

      if (!placeholder) {
        throw new Error(
          `No admin with id or placeholder ${candidateIdentifiers}`,
        );
      }

      const updates: Partial<typeof authUsers.$inferInsert> = { privyDid };
      if (email) updates.email = email;
      if (walletAddress) updates.walletAddress = walletAddress;

      const [claimed] = await tx
        .update(authUsers)
        .set(updates)
        .where(eq(authUsers.id, placeholder.id))
        .returning();

      if (!claimed) {
        throw new Error(`No admin with id ${privyDid}`);
      }

      return claimed;
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
