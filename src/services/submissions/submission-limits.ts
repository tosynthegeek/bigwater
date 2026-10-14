import { SubmissionRejectedError } from "@/utils/errors";

import { and, count, desc, eq, gte, lt, ne, or } from "drizzle-orm";

import { db } from "@/db";

import { submissions, tasks } from "@/db/schema/rail2";

import { periodIndex, timeframes } from "../economy/config";
import { getActiveTaskIds, getActiveTasks } from "@/services/tasks";

export async function enforceSubmissionLimits(
  userId: string,
  task: { id: string; isHighValue: boolean },
) {
  const now = new Date();

  const currentDayIdx = periodIndex(now, timeframes.dayPeriodMs);

  const periodStart = new Date(currentDayIdx * timeframes.dayPeriodMs);
  const periodEnd = new Date((currentDayIdx + 1) * timeframes.dayPeriodMs);

  const limits = await db.query.submissionLimits.findFirst();

  if (!limits) {
    console.error("Submission limits not configured");
    throw new Error("Submission limits not configured");
  }

  // A task can be `active` (admin.updateTask never deactivated it) without
  // being one of today's/yesterday's 5 selected tasks. Without this check a
  // user who already knows a taskId could keep submitting to it after it
  // rotated out of the daily list, bypassing the whole point of the daily
  // selection — enforce it here, not just in what getActiveTasks() returns
  // to the client.
  const activeTaskIds = await getActiveTaskIds(now);
  if (!activeTaskIds.has(task.id)) {
    throw new SubmissionRejectedError(
      "This task is not part of today's selection.",
      400,
    );
  }

  const existingTaskSubmission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.userId, userId),
      eq(submissions.taskId, task.id),
      gte(submissions.createdAt, periodStart),
      lt(submissions.createdAt, periodEnd),
      ne(submissions.status, "rejected"),
    ),
  });

  if (existingTaskSubmission) {
    throw new SubmissionRejectedError(
      "You have already submitted this task today. Please choose a different task.",
      429,
    );
  }

  const latestSubmission = await db.query.submissions.findFirst({
    where: eq(submissions.userId, userId),
    orderBy: desc(submissions.createdAt),
  });

  if (latestSubmission) {
    const elapsedMs = now.getTime() - latestSubmission.createdAt.getTime();

    const cooldownMs = limits.cooldownHours;

    if (elapsedMs < cooldownMs) {
      const minutesLeft = Math.ceil((cooldownMs - elapsedMs) / 60_000);

      throw new SubmissionRejectedError(
        `You must wait ${minutesLeft} more minutes before submitting again.`,
        429,
      );
    }
  }

  // Count every submission toward the daily limit except
  // rejected high-value submissions.
  //
  // Rejected normal submissions still count.
  const totalSubmissionsRes = await db
    .select({
      totalSubmissions: count(),
    })
    .from(submissions)
    .innerJoin(tasks, eq(submissions.taskId, tasks.id))
    .where(
      and(
        eq(submissions.userId, userId),
        gte(submissions.createdAt, periodStart),
        lt(submissions.createdAt, periodEnd),
        ne(submissions.status, "rejected"),
      ),
    );

  const totalSubmissionsCount = totalSubmissionsRes[0]?.totalSubmissions ?? 0;

  if (totalSubmissionsCount >= limits.maxSubmissionsPerDay) {
    throw new SubmissionRejectedError(
      `You have reached the daily limit of ${limits.maxSubmissionsPerDay} submissions.`,
      429,
    );
  }

  if (task.isHighValue) {
    // Only non-rejected high-value submissions count toward
    // the high-value daily limit.
    const result = await db
      .select({
        totalHighValue: count(),
      })
      .from(submissions)
      .innerJoin(tasks, eq(submissions.taskId, tasks.id))
      .where(
        and(
          eq(submissions.userId, userId),
          gte(submissions.createdAt, periodStart),
          lt(submissions.createdAt, periodEnd),
          eq(tasks.isHighValue, true),
          ne(submissions.status, "rejected"),
        ),
      );

    const totalHighValue = result[0]?.totalHighValue ?? 0;

    if (totalHighValue >= limits.maxHighValuePerDay) {
      throw new SubmissionRejectedError(
        `You have reached the daily limit of ${
          limits.maxHighValuePerDay
        } high-value submission${limits.maxHighValuePerDay === 1 ? "" : "s"}.`,
        429,
      );
    }
  }
}

export async function getSubmissionLimitStatus(userId: string) {
  const now = new Date();

  const currentDayIdx = periodIndex(now, timeframes.dayPeriodMs);

  const periodStart = new Date(currentDayIdx * timeframes.dayPeriodMs);
  const periodEnd = new Date((currentDayIdx + 1) * timeframes.dayPeriodMs);

  const limits = await db.query.submissionLimits.findFirst();

  if (!limits) {
    throw new Error("Submission limits not configured");
  }

  const [
    latestSubmission,
    todaySubmissions,
    todayHighValueSubmissions,
    activeTasks,
  ] = await Promise.all([
    db.query.submissions.findFirst({
      where: eq(submissions.userId, userId),
      orderBy: desc(submissions.createdAt),
    }),

    // Use the same counting rule as enforceSubmissionLimits:
    // rejected high-value submissions do not count toward the
    // daily submission limit, while rejected normal submissions do.
    db
      .select({
        taskId: submissions.taskId,
        status: submissions.status,
        isHighValue: tasks.isHighValue,
      })
      .from(submissions)
      .innerJoin(tasks, eq(submissions.taskId, tasks.id))
      .where(
        and(
          eq(submissions.userId, userId),
          gte(submissions.createdAt, periodStart),
          lt(submissions.createdAt, periodEnd),
          ne(submissions.status, "rejected"),
        ),
      ),

    // Only non-rejected high-value submissions count toward
    // the high-value daily limit.
    db
      .select({
        totalHighValue: count(),
      })
      .from(submissions)
      .innerJoin(tasks, eq(submissions.taskId, tasks.id))
      .where(
        and(
          eq(submissions.userId, userId),
          gte(submissions.createdAt, periodStart),
          lt(submissions.createdAt, periodEnd),
          eq(tasks.isHighValue, true),
          ne(submissions.status, "rejected"),
        ),
      ),

    // CHANGED: was `db.query.tasks.findMany({ where: eq(tasks.active, true) })`
    // — every active task, regardless of the daily selection. Now sourced
    // from the same daily-selection-aware function the /tasks endpoint and
    // the Telegram bot use, so all three surfaces agree on "today's tasks".
    getActiveTasks(now),
  ]);

  const cooldownMs = limits.cooldownHours;

  let remainingSeconds = 0;
  let nextSubmissionAt: Date | null = null;

  if (latestSubmission) {
    const expires = latestSubmission.createdAt.getTime() + cooldownMs;

    if (expires > now.getTime()) {
      remainingSeconds = Math.ceil((expires - now.getTime()) / 1000);

      nextSubmissionAt = new Date(expires);
    }
  }

  // todaySubmissions already excludes rejected high-value
  // submissions, so this matches enforceSubmissionLimits().
  const submissionsUsed = todaySubmissions.length;

  const highValueUsed = todayHighValueSubmissions[0]?.totalHighValue ?? 0;

  // Rejected submissions can be retried, so only non-rejected
  // submissions prevent the same task from being submitted again.
  const submittedTaskIds = new Set(
    todaySubmissions
      .filter((s) => s.status !== "rejected")
      .map((s) => s.taskId),
  );

  const dailyLimitReached = submissionsUsed >= limits.maxSubmissionsPerDay;

  const cooldownActive = remainingSeconds > 0;

  const availableTasks =
    !dailyLimitReached && !cooldownActive
      ? activeTasks.filter((task) => {
          if (submittedTaskIds.has(task.id)) {
            return false;
          }

          if (task.isHighValue && highValueUsed >= limits.maxHighValuePerDay) {
            return false;
          }

          return true;
        })
      : [];

  const noTasksConfigured =
    !dailyLimitReached && !cooldownActive && activeTasks.length === 0;

  const noTasksRemaining =
    !dailyLimitReached &&
    !cooldownActive &&
    activeTasks.length > 0 &&
    availableTasks.length === 0;

  return {
    cooldown: {
      active: cooldownActive,
      remainingSeconds,
      nextSubmissionAt,
    },

    today: {
      submissionsUsed,
      submissionsLimit: limits.maxSubmissionsPerDay,
      highValueUsed,
      highValueLimit: limits.maxHighValuePerDay,
    },

    availableTasks,

    taskAvailability: {
      noTasksConfigured,
      noTasksRemaining,
    },
  };
}
