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
  const totalPoints = sql<number>`
    COALESCE(${sustainabilityScore.totalScore}, 0) + 
    COALESCE(${rail1Users.totalPoints}, 0)
  `;
  return db
    .select({
      userId: authUsers.id,
      rail2Points: sustainabilityScore.totalScore,
      rail1Points: rail1Users.totalPoints,
      totalPoints: totalPoints.as("totalPoints"),
      rail1UserId: rail1Users.id,
      walletAddress: rail1Users.walletAddress,
      currentBand: monthlyTally.band,
      currentStreak: userStreaks.currentStreak,
      isUser: currentUserId
        ? sql<boolean>`${authUsers.id} = ${currentUserId}`
        : sql<boolean>`false`,
      rank: sql<number>`RANK() OVER (ORDER BY ${totalPoints} DESC)`.as("rank"),
    })
    .from(participantProfile)
    .innerJoin(authUsers, eq(authUsers.id, participantProfile.userId))
    .leftJoin(sustainabilityScore, eq(sustainabilityScore.userId, authUsers.id))
    .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
    .leftJoin(monthlyTally, currentMonthJoin(now))
    .leftJoin(userStreaks, eq(userStreaks.userId, authUsers.id))
    .orderBy(desc(totalPoints))
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
  const pointsExpr = sql<number>`COALESCE(SUM(${pointsLedger.basePoints}), 0)`;

  return db
    .select({
      userId: authUsers.id,
      points: pointsExpr.as("points"),
      rail1Points: rail1Users.totalPoints,
      rail1UserId: rail1Users.id,
      walletAddress: rail1Users.walletAddress,
      currentBand: monthlyTally.band,
      currentStreak: userStreaks.currentStreak,
      isUser: currentUserId
        ? sql<boolean>`${authUsers.id} = ${currentUserId}`
        : sql<boolean>`false`,
      rank: sql<number>`RANK() OVER (ORDER BY ${pointsExpr} DESC)`.as("rank"),
    })
    .from(participantProfile)
    .innerJoin(authUsers, eq(authUsers.id, participantProfile.userId))
    .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
    .leftJoin(monthlyTally, currentMonthJoin(now))
    .leftJoin(userStreaks, eq(userStreaks.userId, authUsers.id))
    .leftJoin(
      pointsLedger,
      and(
        eq(pointsLedger.userId, authUsers.id),
        sql`${pointsLedger.createdAt} >= ${start}`,
        sql`${pointsLedger.createdAt} < ${end}`,
      ),
    )
    .groupBy(
      authUsers.id,
      rail1Users.totalPoints,
      monthlyTally.band,
      userStreaks.currentStreak,
    )
    .orderBy(desc(pointsExpr))
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
      rail1UserId: rail1Users.id,
      walletAddress: rail1Users.walletAddress,
      currentBand: monthlyTally.band,
      currentStreak: userStreaks.currentStreak,
      isUser: currentUserId
        ? sql<boolean>`${authUsers.id} = ${currentUserId}`
        : sql<boolean>`false`,
      rank: sql<number>`RANK() OVER (ORDER BY ${monthlyTally.baseTally} DESC)`.as(
        "rank",
      ),
    })
    .from(participantProfile)
    .innerJoin(authUsers, eq(authUsers.id, participantProfile.userId))
    .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
    .leftJoin(
      monthlyTally,
      and(eq(monthlyTally.userId, authUsers.id), eq(monthlyTally.month, month)),
    )
    .leftJoin(userStreaks, eq(userStreaks.userId, authUsers.id))
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
      points: number;
      rail1_points: number | null;
      rail2_points: number | null;
      current_band: string | null;
      current_streak: number | null;
      rank: number;
    }>(sql`
      SELECT  points, rail1_points, rail2_points, current_band, current_streak, rank FROM (
        SELECT
          u.id AS user_id,
          COALESCE(ss.total_score, 0) + COALESCE(r1.total_points, 0) AS points,
          r1.total_points AS rail1_points,
          ss.total_score AS rail2_points,
          mt.band AS current_band,
          us.current_streak,
          RANK() OVER (ORDER BY (COALESCE(ss.total_score, 0) + COALESCE(r1.total_points, 0)) DESC) AS rank
        FROM participant_profile pp
        INNER JOIN auth_accounts u ON u.id = pp.user_id
        LEFT JOIN sustainability_score ss ON ss.user_id = u.id
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
      points: number;
      current_band: string | null;
      current_streak: number | null;
      rank: number;
    }>(sql`
      SELECT points, current_band, current_streak, rank FROM (
        SELECT
          u.id AS user_id,
          COALESCE(SUM(pl.base_points), 0) AS points,
          mt.band AS current_band,
          us.current_streak,
          RANK() OVER (ORDER BY COALESCE(SUM(pl.base_points), 0) DESC) AS rank
        FROM participant_profile pp
        INNER JOIN auth_accounts u ON u.id = pp.user_id
        LEFT JOIN points_ledger pl
          ON pl.user_id = u.id
          AND pl.created_at >= ${start}
          AND pl.created_at < ${end}
        LEFT JOIN monthly_tally mt ON mt.user_id = u.id AND mt.month = ${getTallyPeriod(now).key}
        LEFT JOIN user_streaks us ON us.user_id = u.id
        GROUP BY u.id, mt.band, us.current_streak
      ) ranked
      WHERE user_id = ${userId}
    `);
    return rows[0] ? { userId, ...rows[0], type } : null;
  }

  if (!month)
    throw new Error("month is required for monthly leaderboard context");
  const rows = await db.execute<{
    points: number;
    current_band: string | null;
    current_streak: number | null;
    rank: number;
  }>(sql`
    SELECT points, current_band, current_streak, rank FROM (
      SELECT
        u.id AS user_id,
        mt.base_tally AS points,
        mt.band AS current_band,
        us.current_streak,
        RANK() OVER (ORDER BY COALESCE(mt.base_tally, 0) DESC) AS rank
      FROM participant_profile pp
      INNER JOIN auth_accounts u ON u.id = pp.user_id
      LEFT JOIN monthly_tally mt ON mt.user_id = u.id AND mt.month = ${month}
      LEFT JOIN user_streaks us ON us.user_id = u.id
    ) ranked
    WHERE user_id = ${userId}
  `);
  return rows[0] ? { userId, ...rows[0], type } : null;
}
