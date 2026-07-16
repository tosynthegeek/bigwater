import { type Context } from "hono";
import { generateTelegramLinkCode } from "@/services/identity";
import {
  monthlyTally,
  participantProfile,
  submissions,
  sustainabilityScore,
  tasks,
  users,
  userStreaks,
} from "@/db/schema/bigwater";
import { db } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getTallyPeriod } from "@/services/economy/tally";

export type User = typeof users.$inferSelect;

export async function login(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const [profile] = await db
      .select()
      .from(participantProfile)
      .where(eq(participantProfile.userId, user.id));

    const isTelegramLinked = !!profile?.telegramId;

    return c.json({ user, isTelegramLinked }, 200);
  } catch (error) {
    console.error("Controllers.participants-controllers.login.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
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
        walletAddress: participantProfile.walletAddress,
        status: participantProfile.status,

        totalScore: sustainabilityScore.totalScore,
        headStart: sustainabilityScore.headStart,

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
      .innerJoin(
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
      .leftJoin(userStreaks, eq(userStreaks.userId, user.id));

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
      })
      .from(submissions)
      .leftJoin(tasks, eq(submissions.taskId, tasks.id))
      .where(eq(submissions.userId, user.id))
      .orderBy(desc(submissions.createdAt));

    const result = rows.map(({ submission, taskTitle }) => ({
      ...submission,
      taskId: submission.taskId ?? "custom",
      taskTitle: taskTitle ?? "Custom",
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
