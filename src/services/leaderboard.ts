import { db } from "@/db";
import {
  participantProfile,
  sustainabilityScore,
  monthlyTally,
  users,
  userStreaks,
} from "@/db/schema/bigwater";

import { desc, eq, sql } from "drizzle-orm";

export async function getGlobalLeaderboard(limit = 100) {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      sustainabilityScore: sustainabilityScore.totalScore,
      currentBand: participantProfile.currentBand,
      currentStreak: userStreaks.currentStreak,
    })
    .from(sustainabilityScore)
    .innerJoin(users, eq(users.id, sustainabilityScore.userId))
    .innerJoin(participantProfile, eq(participantProfile.userId, users.id))
    .leftJoin(userStreaks, eq(userStreaks.userId, users.id))
    .orderBy(desc(sustainabilityScore.totalScore))
    .limit(limit);
}

export async function getMonthlyLeaderboard(month: string, limit = 100) {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,

      baseTally: monthlyTally.baseTally,

      band: monthlyTally.band,
    })
    .from(monthlyTally)
    .innerJoin(users, eq(users.id, monthlyTally.userId))
    .where(eq(monthlyTally.month, month))
    .orderBy(desc(monthlyTally.baseTally))
    .limit(limit);
}

export async function getUserRank(userId: string) {
  const result = await db.execute(sql`
    SELECT *
    FROM (
      SELECT
        user_id,
        total_score,
        RANK() OVER (ORDER BY total_score DESC) AS rank
      FROM sustainability_score
    ) ranked
    WHERE ranked.user_id = ${userId};
  `);

  return result[0] ?? null;
}
