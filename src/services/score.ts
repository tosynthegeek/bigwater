import { and, eq, sql } from "drizzle-orm";
import { getTallyPeriod } from "./economy/tally";
import { db } from "@/db";
import {
  monthlyTally,
  participantProfile,
  sustainabilityScore,
  userStreaks,
} from "@/db/schema/rail2";
import { rail1Users } from "@/db/schema/rail1";
import { getBandForMonthlyTally } from "./economy/bands";

export async function getUserScoreSummary(userId: string) {
  const now = new Date();
  const currentMonthKey = getTallyPeriod(now).key;

  const [profile] = await db
    .select({
      userId: participantProfile.userId,
      participantId: participantProfile.id,
      username: participantProfile.username,
      isMember: participantProfile.isMember,
      isFlagged: participantProfile.isFlagged,
      walletAddress: rail1Users.walletAddress,
      status: participantProfile.status,
      telegramId: participantProfile.telegramId,

      // sustainabilityScore rows are created lazily (on a member's first
      // scored submission) — COALESCE keeps a brand-new participant with
      // no score yet from disappearing from this query entirely.
      totalScore: sql<number>`
      COALESCE(${sustainabilityScore.totalScore}, 0) + COALESCE(${rail1Users.totalPoints}, 0)
    `.mapWith(Number),
      headStart:
        sql<number>`COALESCE(${sustainabilityScore.headStart}, 0)`.mapWith(
          Number,
        ),
      rail2score:
        sql<number>`COALESCE(${sustainabilityScore.totalScore}, 0)`.mapWith(
          Number,
        ),
      rail1score: rail1Users.totalPoints,
      monthlyTally: monthlyTally.baseTally,
      currentBand: monthlyTally.band,
      multiplier: monthlyTally.multiplier,

      currentStreak: userStreaks.currentStreak,
      longestStreak: userStreaks.longestStreak,

      globalRank: sql<number>`
        (
          SELECT rank
          FROM (
            SELECT
              u.id AS user_id,
              RANK() OVER (
                ORDER BY (
                  COALESCE(ss.total_score, 0)
                  + COALESCE(r1.total_points, 0)
                ) DESC
              ) AS rank
            FROM users r1
            FULL JOIN participant_profile pp
              ON pp.rail1_user_id = r1.id
            LEFT JOIN auth_accounts u
              ON u.id = pp.user_id
            LEFT JOIN sustainability_score ss
              ON ss.user_id = u.id
          ) ranked
          WHERE ranked.user_id = ${userId}
        )
      `
        .mapWith(Number)
        .as("global_rank"),
      rail2Rank: sql<number>`
        (
          SELECT rank
          FROM (
            SELECT
              pp2.user_id,
              RANK() OVER (
                ORDER BY COALESCE(ss2.total_score, 0) DESC
              ) AS rank
            FROM participant_profile pp2
            LEFT JOIN sustainability_score ss2
              ON ss2.user_id = pp2.user_id
          ) ranked
          WHERE ranked.user_id = ${userId}
        )
      `
        .mapWith(Number)
        .as("rail2_rank"),
    })
    .from(participantProfile)
    .where(eq(participantProfile.userId, userId))
    .leftJoin(
      sustainabilityScore,
      eq(sustainabilityScore.userId, participantProfile.userId),
    )
    .leftJoin(
      monthlyTally,
      and(
        eq(monthlyTally.userId, participantProfile.userId),
        eq(monthlyTally.month, currentMonthKey),
        eq(monthlyTally.isFinalized, false),
      ),
    )
    .leftJoin(userStreaks, eq(userStreaks.userId, userId))
    .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId));

  if (!profile) return null;

  if (profile.currentBand === null) {
    const fallbackBand = await getBandForMonthlyTally(0);
    profile.monthlyTally = 0;
    profile.currentBand = fallbackBand.name;
    profile.multiplier = fallbackBand.multiplier;
  }

  return profile;
}
