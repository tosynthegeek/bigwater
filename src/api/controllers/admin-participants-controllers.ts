import { type Context } from "hono";
import {
  monthlyTally,
  participantProfile,
  pointsLedger,
  sustainabilityScore,
  authUsers,
  userStreaks,
  type User,
} from "@/db/schema/rail2";
import { db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { format } from "date-fns";
import { getBandForMonthlyTally } from "@/services/economy/bands";
import { getTallyPeriod } from "@/services/economy/tally";

export async function getAllParticipants(c: Context) {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");
  const search = c.req.query("search");
  const now = new Date();

  try {
    const [participants, stats] = await Promise.all([
      db
        .select({
          userId: authUsers.id,
          username: participantProfile.username,
          walletAddress: participantProfile.walletAddress,
          // sustainabilityScore rows are created lazily (on a member's first
          // scored submission) — a leftJoin + COALESCE keeps brand-new
          // members with a real profile visible in this list instead of
          // silently dropping them until their first score lands.
          totalScore:
            sql<number>`COALESCE(${sustainabilityScore.totalScore}, 0)`.mapWith(
              Number,
            ),
          currentBand: monthlyTally.band,
          currentStreak: userStreaks.currentStreak,
          isMember: participantProfile.isMember,
          isFlagged: participantProfile.isFlagged,
          status: participantProfile.status,
        })
        .from(authUsers)
        .innerJoin(
          participantProfile,
          eq(participantProfile.userId, authUsers.id),
        )
        .leftJoin(
          sustainabilityScore,
          eq(sustainabilityScore.userId, authUsers.id),
        )
        .leftJoin(
          monthlyTally,
          and(
            eq(monthlyTally.userId, authUsers.id),
            eq(monthlyTally.month, getTallyPeriod(now).key),
          ),
        )
        .leftJoin(userStreaks, eq(userStreaks.userId, authUsers.id))
        .where(
          search
            ? sql`${participantProfile.username} ILIKE ${`%${search}%`}`
            : undefined,
        )
        .orderBy(sql`COALESCE(${sustainabilityScore.totalScore}, 0) DESC`)
        .limit(limit)
        .offset(offset),

      db
        .select({
          totalMembers: sql<number>`COUNT(*)`.mapWith(Number),
          flaggedCount:
            sql<number>`SUM(CASE WHEN ${participantProfile.isFlagged} THEN 1 ELSE 0 END)`.mapWith(
              Number,
            ),
          activeThisWeek: sql<number>`
            COUNT(DISTINCT CASE WHEN ${pointsLedger.createdAt} >= NOW() - INTERVAL '7 days' THEN ${authUsers.id} END)
          `.mapWith(Number),
        })
        .from(authUsers)
        .innerJoin(
          participantProfile,
          eq(participantProfile.userId, authUsers.id),
        )
        .leftJoin(pointsLedger, eq(pointsLedger.userId, authUsers.id)),
    ]);

    return c.json({
      participants,
      pagination: { limit, offset, hasMore: participants.length === limit },
      stats: stats[0] ?? {
        totalMembers: 0,
        flaggedCount: 0,
        activeThisWeek: 0,
      },
    });
  } catch (error) {
    console.error("Controllers.getAllParticipants.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function flagParticipant(c: Context) {
  const admin = c.get("user") as User;
  if (!admin || admin.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const userId = c.req.param("userId");

  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const { isFlagged, reason } = await c.req.json();

  if (typeof isFlagged !== "boolean") {
    return c.json({ error: "isFlagged must be a boolean" }, 400);
  }

  try {
    const [updated] = await db
      .update(participantProfile)
      .set({
        isFlagged,
        updatedAt: new Date(),
      })
      .where(eq(participantProfile.userId, userId))
      .returning({
        userId: participantProfile.userId,
        isFlagged: participantProfile.isFlagged,
        username: participantProfile.username,
      });

    if (!updated) {
      return c.json({ error: "Participant not found" }, 404);
    }

    console.log(
      `Admin ${admin.id} ${isFlagged ? "flagged" : "unflagged"} user ${userId}. Reason: ${reason || "none"}`,
    );

    return c.json({
      message: `Participant ${isFlagged ? "flagged" : "unflagged"} successfully`,
      participant: updated,
    });
  } catch (error) {
    console.error("flagParticipant.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function adjustParticipantPoints(c: Context) {
  const admin = c.get("user") as User;
  if (!admin || admin.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const userId = c.req.param("userId");
  if (!userId) {
    return c.json({ error: "User ID is required" }, 400);
  }

  const { points, reason, month } = await c.req.json();

  if (typeof points !== "number") {
    return c.json({ error: "points must be a number" }, 400);
  }
  if (!reason) {
    return c.json({ error: "reason is required for audit" }, 400);
  }

  const targetMonth = month || format(new Date(), "yyyy-MM");
  const now = new Date();
  const periodEnd = getTallyPeriod(now).end;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(pointsLedger).values({
        userId,
        submissionId: null,
        basePoints: points,
        month: targetMonth,
      });

      await tx
        .insert(monthlyTally)
        .values({
          userId,
          month: targetMonth,
          baseTally: points,
          periodEnd,
        })
        .onConflictDoUpdate({
          target: [monthlyTally.userId, monthlyTally.month],
          set: {
            baseTally: sql`${monthlyTally.baseTally} + ${points}`,
            updatedAt: new Date(),
          },
        });

      const tally = await tx.query.monthlyTally.findFirst({
        where: and(
          eq(monthlyTally.userId, userId),
          eq(monthlyTally.month, targetMonth),
        ),
      });

      if (tally) {
        const band = await getBandForMonthlyTally(tally.baseTally);

        await tx
          .update(monthlyTally)
          .set({ band: band.name, multiplier: band.multiplier })
          .where(eq(monthlyTally.id, tally.id));
      }
    });

    return c.json({
      message: `Successfully adjusted ${points > 0 ? "added" : "deducted"} ${Math.abs(points)} points for user`,
      userId,
      pointsAdjusted: points,
      reason,
    });
  } catch (error) {
    console.error("adjustParticipantPoints.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
