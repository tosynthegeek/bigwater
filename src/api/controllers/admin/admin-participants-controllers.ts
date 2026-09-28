import { type Context } from "hono";
import {
  monthlyTally,
  participantProfile,
  pointsLedger,
  sustainabilityScore,
  authUsers,
  userStreaks,
  type User,
  participantWarnings,
} from "@/db/schema/rail2";
import { db } from "@/db";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { format } from "date-fns";
import { getBandForMonthlyTally } from "@/services/economy/bands";
import { getTallyPeriod } from "@/services/economy/tally";
import { rail1Users } from "@/db/schema/rail1";
import { enqueueParticipantNotification } from "@/services/queues/participant-notification.queue";

export async function getAllParticipants(c: Context) {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");
  const search = c.req.query("search");
  const now = new Date();

  try {
    const [participants, stats, activeThisWeekResult] = await Promise.all([
      db
        .select({
          userId: authUsers.id,
          username: participantProfile.username,
          participantId: participantProfile.id,
          walletAddress: rail1Users.walletAddress,
          totalScore:
            sql<number>`COALESCE(${sustainabilityScore.totalScore}, 0)`.mapWith(
              Number,
            ),
          currentBand: monthlyTally.band,
          currentStreak: userStreaks.currentStreak,
          isMember: participantProfile.isMember,
          isFlagged: participantProfile.isFlagged,
          warningCount: participantProfile.warningCount,
          telegramId: participantProfile.telegramId,
          status: participantProfile.status,
        })
        .from(authUsers)
        .innerJoin(
          participantProfile,
          eq(participantProfile.userId, authUsers.id),
        )
        .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
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
            ? or(
                ilike(participantProfile.username, `%${search}%`),
                ilike(rail1Users.walletAddress, `%${search}%`),
                ilike(authUsers.email, `%${search}%`),
              )
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
        })
        .from(participantProfile),

      // Active this week (separate query to avoid join multiplication)
      db
        .select({
          count: sql<number>`COUNT(DISTINCT ${pointsLedger.userId})`.mapWith(
            Number,
          ),
        })
        .from(pointsLedger)
        .where(sql`${pointsLedger.createdAt} >= NOW() - INTERVAL '7 days'`),
    ]);

    const statsData = stats[0] ?? { totalMembers: 0, flaggedCount: 0 };
    const activeThisWeek = activeThisWeekResult[0]?.count ?? 0;

    return c.json({
      participants,
      pagination: {
        limit,
        offset,
        hasMore: participants.length === limit,
      },
      stats: {
        totalMembers: statsData.totalMembers,
        flaggedCount: statsData.flaggedCount,
        activeThisWeek,
      },
    });
  } catch (error) {
    console.error("Controllers.getAllParticipants.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function flagParticipant(c: Context) {
  const admin = c.get("user") as User;

  if (!admin || (admin.role != "superadmin" && admin.role != "admin")) {
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
        telegramId: participantProfile.telegramId,
      });

    if (!updated) {
      return c.json({ error: "Participant not found" }, 404);
    }

    console.log(
      `Admin ${admin.id} ${isFlagged ? "flagged" : "unflagged"} user ${userId}. Reason: ${reason || "none"}`,
    );

    if (isFlagged && updated.telegramId) {
      const reasonText = reason ? ` Reason: ${reason}` : "";
      const message = `🚩 Your account has been flagged.${reasonText} Please contact support if you believe this is a mistake`;
      await enqueueParticipantNotification(updated.telegramId, message);
    }

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
  if (!admin || (admin.role != "superadmin" && admin.role != "admin")) {
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

  const now = new Date();
  const currentPeriod = getTallyPeriod(now);

  const targetMonth = month || currentPeriod.key;
  const periodEnd = currentPeriod.end;

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

export async function warnParticipant(c: Context) {
  const admin = c.get("user") as User;
  if (!admin || (admin.role !== "superadmin" && admin.role !== "admin")) {
    return c.json({ error: "Admin access required" }, 403);
  }

  const participantId = c.req.param("participantId");
  if (!participantId) {
    return c.json({ error: "Participant ID is required" }, 400);
  }

  const { reason } = await c.req.json();
  if (!reason) {
    return c.json({ error: "reason is required for audit" }, 400);
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(participantProfile)
        .set({
          warningCount: sql`${participantProfile.warningCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(participantProfile.userId, participantId))
        .returning({
          id: participantProfile.id,
          userId: participantProfile.userId,
          warningCount: participantProfile.warningCount,
          username: participantProfile.username,
          telegramId: participantProfile.telegramId,
        });

      if (!updated) {
        return null;
      }

      // CHANGED: use updated.id (participantProfile.id), not the userId
      // route param, since participantWarnings.participantId references
      // participantProfile.id.
      await tx.insert(participantWarnings).values({
        participantId: updated.id,
        reason,
        issuedBy: admin.id,
      });

      return updated;
    });

    if (!result) {
      return c.json({ error: "Participant not found" }, 404);
    }

    console.log(
      `Admin ${admin.id} warned user ${result.userId}. Reason: ${reason}`,
    );

    if (result.telegramId) {
      const message = `⚠️ You have received a warning on your account.\nReason: ${reason}\n\n.Please review the community guidelines to avoid further action.`;
      await enqueueParticipantNotification(result.telegramId, message);
    }

    return c.json({
      message: "Participant warned successfully",
      participant: {
        userId: result.userId,
        warningCount: result.warningCount,
        username: result.username,
      },
    });
  } catch (error) {
    console.error("warnParticipant.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
