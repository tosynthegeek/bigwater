import { startOfDayUtc } from "@/utils/time";
import { SubmissionRejectedError } from "@/utils/errors";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { submissions, tasks } from "@/db/schema/rail2";
import { periodIndex, timeframes } from "../economy/config";

export async function enforceSubmissionLimits(
  userId: string,
  task: { id: string; isHighValue: boolean },
) {
  const now = new Date();
  const currentDayIdx = periodIndex(now, timeframes.dayPeriodMs);
  const periodStart = new Date(currentDayIdx * timeframes.dayPeriodMs);

  const limits = await db.query.submissionLimits.findFirst();

  if (!limits) {
    throw new Error("Submission limits not configured");
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

  const totalSubmissionsRes = await db
    .select({
      totalSubmissions: count(),
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        gte(submissions.createdAt, periodStart),
      ),
    );

  const totalSubmissionsCount = totalSubmissionsRes[0]?.totalSubmissions ?? 0;

  if (totalSubmissionsCount >= limits.maxSubmissionsPerDay) {
    throw new SubmissionRejectedError(
      `You have reached the daily limit of ${limits.maxSubmissionsPerDay} submissions.`,
      429,
    );
  }

  if (task?.isHighValue) {
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
          eq(tasks.isHighValue, true),
        ),
      );

    const totalHighValue = result[0]?.totalHighValue ?? 0;

    if (totalHighValue >= limits.maxHighValuePerDay) {
      throw new SubmissionRejectedError(
        `You have reached the daily limit of ${limits.maxHighValuePerDay} high-value submission${limits.maxHighValuePerDay === 1 ? "" : "s"}.`,
        429,
      );
    }
  }
}

export async function getSubmissionLimitStatus(userId: string) {
  const now = new Date();
  const today = startOfDayUtc(now);

  const limits = await db.query.submissionLimits.findFirst();

  if (!limits) {
    throw new Error("Submission limits not configured");
  }

  const latestSubmission = await db.query.submissions.findFirst({
    where: eq(submissions.userId, userId),
    orderBy: desc(submissions.createdAt),
  });

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

  const totalSubmissionsRes = await db
    .select({
      totalSubmissions: count(),
    })
    .from(submissions)
    .where(
      and(eq(submissions.userId, userId), gte(submissions.createdAt, today)),
    );

  const totalSubmissionsCount = totalSubmissionsRes[0]?.totalSubmissions ?? 0;

  const totalHighValueRes = await db
    .select({
      totalHighValue: count(),
    })
    .from(submissions)
    .innerJoin(tasks, eq(submissions.taskId, tasks.id))
    .where(
      and(
        eq(submissions.userId, userId),
        gte(submissions.createdAt, today),
        eq(tasks.isHighValue, true),
      ),
    );

  const totalHighValueCount = totalHighValueRes[0]?.totalHighValue ?? 0;

  return {
    cooldown: {
      active: remainingSeconds > 0,
      remainingSeconds,
      nextSubmissionAt,
    },
    today: {
      submissionsUsed: totalSubmissionsCount,
      submissionsLimit: limits.maxSubmissionsPerDay,
      highValueUsed: totalHighValueCount,
      highValueLimit: limits.maxHighValuePerDay,
    },
  };
}
