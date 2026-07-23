import { db } from "@/db";
import {
  sustainabilityScore,
  monthlyTally,
  authUsers,
  userStreaks,
  pointsLedger,
  participantProfile,
} from "@/db/schema/rail2";
import { and, desc, eq, sql } from "drizzle-orm";
import { getTallyPeriod, getWeekPeriod } from "./economy/tally";
import { rail1Users } from "@/db/schema/rail1";

export type LeaderboardTimeframe = "global" | "weekly" | "monthly";

function currentMonthJoin(now: Date) {
  return and(
    eq(monthlyTally.userId, authUsers.id),
    eq(monthlyTally.month, getTallyPeriod(now).key),
  );
}

export async function getLeaderboard(
  timeframe: LeaderboardTimeframe,
  params: {
    limit: number;
    offset: number;
    month?: string;
    currentUserId: string;
  },
) {
  switch (timeframe) {
    case "global":
      return getGlobalLeaderboard(
        params.limit,
        params.offset,
        params.currentUserId,
      );
    case "weekly":
      return getWeeklyLeaderboard(
        params.limit,
        params.offset,
        params.currentUserId,
      );
    case "monthly":
      return getMonthlyLeaderboard(
        params.month!,
        params.limit,
        params.offset,
        params.currentUserId,
      );
  }
}

export async function getGlobalLeaderboard(
  limit = 50,
  offset = 0,
  currentUserId: string,
) {
  const now = new Date();
  return db
    .select({
      userId: authUsers.id,
      rail2Points: sustainabilityScore.totalScore,
      rail1Points: rail1Users.totalPoints,
      totalPoints: sql<number>`
        COALESCE(${sustainabilityScore.totalScore}, 0) + 
        COALESCE(${rail1Users.totalPoints}, 0)
      `.as("totalPoints"),
      currentBand: monthlyTally.band,
      currentStreak: userStreaks.currentStreak,
      isUser: currentUserId
        ? sql<boolean>`${authUsers.id} = ${currentUserId}`
        : sql<boolean>`false`,
    })
    .from(sustainabilityScore)
    .innerJoin(authUsers, eq(authUsers.id, sustainabilityScore.userId))
    .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
    .leftJoin(monthlyTally, currentMonthJoin(now))
    .leftJoin(userStreaks, eq(userStreaks.userId, authUsers.id))
    .orderBy(desc(sql`totalPoints`))
    .limit(limit)
    .offset(offset);
}

export async function getWeeklyLeaderboard(
  limit = 50,
  offset = 0,
  currentUserId: string,
) {
  const now = new Date();
  const { start, end } = getWeekPeriod(now);

  return db
    .select({
      userId: authUsers.id,
      points: sql<number>`SUM(${pointsLedger.basePoints})`.as("points"),
      rail1Points: rail1Users.totalPoints,
      currentBand: monthlyTally.band,
      currentStreak: userStreaks.currentStreak,
      isUser: currentUserId
        ? sql<boolean>`${authUsers.id} = ${currentUserId}`
        : sql<boolean>`false`,
    })
    .from(pointsLedger)
    .innerJoin(authUsers, eq(authUsers.id, pointsLedger.userId))
    .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
    .leftJoin(monthlyTally, currentMonthJoin(now))
    .leftJoin(userStreaks, eq(userStreaks.userId, authUsers.id))
    .where(
      and(
        sql`${pointsLedger.createdAt} >= ${start}`,
        sql`${pointsLedger.createdAt} < ${end}`,
      ),
    )
    .groupBy(authUsers.id, monthlyTally.band, userStreaks.currentStreak)
    .orderBy(desc(sql`points`))
    .limit(limit)
    .offset(offset);
}

export async function getMonthlyLeaderboard(
  month: string,
  limit = 50,
  offset = 0,
  currentUserId: string,
) {
  return db
    .select({
      userId: authUsers.id,
      points: monthlyTally.baseTally,
      rail1Points: rail1Users.totalPoints,
      currentBand: monthlyTally.band,
      currentStreak: userStreaks.currentStreak,
      isUser: currentUserId
        ? sql<boolean>`${authUsers.id} = ${currentUserId}`
        : sql<boolean>`false`,
    })
    .from(monthlyTally)
    .innerJoin(authUsers, eq(authUsers.id, monthlyTally.userId))
    .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
    .leftJoin(userStreaks, eq(userStreaks.userId, authUsers.id))
    .where(eq(monthlyTally.month, month))
    .orderBy(desc(monthlyTally.baseTally))
    .limit(limit)
    .offset(offset);
}

export async function getUserLeaderboardContext(
  userId: string,
  type: "global" | "weekly" | "monthly" = "global",
  month?: string,
) {
  const now = new Date();

  if (type === "global") {
    const rows = await db.execute<{
      display_name: string | null;
      points: number;
      current_band: string | null;
      current_streak: number | null;
      rank: number;
    }>(sql`
      SELECT display_name, points, rail1_points, rail2_points, current_band, current_streak, rank FROM (
        SELECT
          u.id AS user_id,
          COALESCE(ss.total_score, 0) + COALESCE(r1.total_points, 0) AS points,
          r1.total_points AS rail1_points,
          ss.total_score AS rail2_points,
          mt.band AS current_band,
          us.current_streak,
          RANK() OVER (ORDER BY (COALESCE(ss.total_score, 0) + COALESCE(r1.total_points, 0)) DESC) AS rank
        FROM sustainability_score ss
        INNER JOIN auth_accounts u ON u.id = ss.user_id
        INNER JOIN participant_profile pp ON pp.user_id = u.id
        LEFT JOIN users r1 ON r1.id = pp.rail1_user_id
        LEFT JOIN monthly_tally mt ON mt.user_id = u.id AND mt.month = ${getTallyPeriod(now).key}
        LEFT JOIN user_streaks us ON us.user_id = u.id
      ) ranked
      WHERE user_id = ${userId}
    `);
    return rows[0] ? { userId, ...rows[0], type } : null;
  }

  if (type === "weekly") {
    const { start, end } = getWeekPeriod(now);
    const rows = await db.execute<{
      display_name: string | null;
      points: number;
      current_band: string | null;
      current_streak: number | null;
      rank: number;
    }>(sql`
      SELECT display_name, points, current_band, current_streak, rank FROM (
        SELECT
          u.id AS user_id,
          u.display_name,
          COALESCE(SUM(pl.base_points), 0) AS points,
          mt.band AS current_band,
          us.current_streak,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.base_points), 0) DESC) AS rank
        FROM points_ledger pl
        INNER JOIN users u ON u.id = pl.user_id
        LEFT JOIN monthly_tally mt ON mt.user_id = u.id AND mt.month = ${getTallyPeriod(now).key}
        LEFT JOIN user_streaks us ON us.user_id = u.id
        WHERE pl.created_at >= ${start} AND pl.created_at < ${end}
        GROUP BY u.id, u.display_name, mt.band, us.current_streak
      ) ranked
      WHERE user_id = ${userId}
    `);
    return rows[0] ? { userId, ...rows[0], type } : null;
  }

  if (!month)
    throw new Error("month is required for monthly leaderboard context");
  const rows = await db.execute<{
    display_name: string | null;
    points: number;
    current_band: string | null;
    current_streak: number | null;
    rank: number;
  }>(sql`
    SELECT display_name, points, current_band, current_streak, rank FROM (
      SELECT
        u.id AS user_id,
        u.display_name,
        mt.base_tally AS points,
        mt.band AS current_band,
        us.current_streak,
        RANK() OVER (ORDER BY mt.base_tally DESC) AS rank
      FROM monthly_tally mt
      INNER JOIN users u ON u.id = mt.user_id
      LEFT JOIN user_streaks us ON us.user_id = u.id
      WHERE mt.month = ${month}
    ) ranked
    WHERE user_id = ${userId}
  `);
  return rows[0] ? { userId, ...rows[0], type } : null;
}
