import { type Context } from "hono";
import { generateTelegramLinkCode } from "@/services/identity";
import {
  monthlyTally,
  participantProfile,
  submissions,
  sustainabilityScore,
  tasks,
  userStreaks,
  type User,
} from "@/db/schema/rail2";
import { db } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getTallyPeriod } from "@/services/economy/tally";
import { verifyRail1Token } from "@/middleware/rail1-jwt";
import { rail1Users } from "@/db/schema/rail1";

export async function linkRailOne(c: Context) {
  const user = c.get("user") as User | null;
  const rail1Token = c.req.header("x-rail1-token");

  if (!user) {
    return c.json({ error: "unauthenticated" }, 401);
  }
  if (!rail1Token) {
    return c.json(
      {
        error: "missing_rail1_token",
        message: "X-Rail1-Token header required",
      },
      400,
    );
  }
  if (!user.participantProfile) {
    return c.json(
      { error: "no_profile", message: "participant profile not found" },
      500,
    );
  }
  if (user.participantProfile.rail1UserId) {
    return c.json({
      linked: true,
      rail1UserId: user.participantProfile.rail1UserId,
    });
  }

  try {
    const rail1UserId = await verifyRail1Token(rail1Token);
    const [updated] = await db
      .update(participantProfile)
      .set({ rail1UserId })
      .where(eq(participantProfile.id, user.participantProfile.id))
      .returning();
    if (!updated) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ linked: true, rail1UserId: updated.rail1UserId });
  } catch (err) {
    return c.json(
      { error: "invalid_rail1_token", message: (err as Error).message },
      401,
    );
  }
}

// Web app calls this (authenticated) when the user clicks "link Telegram".
// Returns a code the frontend turns into t.me/<bot_username>?start=<code>.
export async function createTelegramLinkCode(c: Context) {
  const user = c.get("user") as User;

  try {
    const { code, expiresAt } = await generateTelegramLinkCode(user.id);
    return c.json({ code, expiresAt }, 200);
  } catch (error) {
    console.error(
      "Controllers.participants-controllers.createTelegramLinkCode.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getParticipantProfile(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const now = new Date();
  const currentMonthKey = getTallyPeriod(now).key;

  try {
    const [profile] = await db
      .select({
        userId: participantProfile.userId,
        username: participantProfile.username,
        isMember: participantProfile.isMember,
        isFlagged: participantProfile.isFlagged,
        walletAddress: rail1Users.walletAddress,
        status: participantProfile.status,
        telegramId: participantProfile.telegramId,

        // sustainabilityScore rows are created lazily (on a member's first
        // scored submission) — COALESCE keeps a brand-new participant with
        // no score yet from disappearing from this query entirely.
        totalScore:
          sql<number>`COALESCE(${sustainabilityScore.totalScore}, 0)`.mapWith(
            Number,
          ),
        headStart:
          sql<number>`COALESCE(${sustainabilityScore.headStart}, 0)`.mapWith(
            Number,
          ),

        monthlyTally: monthlyTally.baseTally,
        currentBand: monthlyTally.band,
        multiplier: monthlyTally.multiplier,

        currentStreak: userStreaks.currentStreak,
        longestStreak: userStreaks.longestStreak,

        globalRank: sql<number>`
        (SELECT RANK() OVER (ORDER BY total_score DESC) 
         FROM sustainability_score 
         WHERE user_id = ${user.id})
      `.as("global_rank"),
      })
      .from(participantProfile)
      .where(eq(participantProfile.userId, user.id))
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
      .leftJoin(userStreaks, eq(userStreaks.userId, user.id))
      .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId));

    if (!profile) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ profile }, 200);
  } catch (error) {
    console.error(
      "Controllers.participants-controllers.getParticipantProfile.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getParticipantSubmissions(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const rows = await db
      .select({
        submission: submissions,
        taskTitle: tasks.title,
        basePoints: tasks.basePoints,
      })
      .from(submissions)
      .leftJoin(tasks, eq(submissions.taskId, tasks.id))
      .where(eq(submissions.userId, user.id))
      .orderBy(desc(submissions.createdAt));

    const result = rows.map(({ submission, taskTitle, basePoints }) => ({
      ...submission,
      taskId: submission.taskId ?? "custom",
      taskTitle: taskTitle ?? "Custom",
      basePoints: basePoints ?? 0,
    }));

    return c.json({ submissions: result }, 200);
  } catch (error) {
    console.error(
      "Controllers.participants-controllers.getParticipantSubmissions.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}
