import { startOfDayUtc } from "@/utils/time";
import { SubmissionRejectedError } from "@/utils/errors";
import { getSubmissionLimits } from "../economy/limits";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { submissions, tasks } from "@/db/schema/bigwater";

export async function enforceSubmissionLimits(
  userId: string,
  task: { id: string; isHighValue: boolean } | null,
) {
  const now = new Date();
  const today = startOfDayUtc(now);

  const limits = await getSubmissionLimits();

  const latestSubmission = await db.query.submissions.findFirst({
    where: eq(submissions.userId, userId),
    orderBy: desc(submissions.createdAt),
  });

  if (latestSubmission) {
    const elapsedMs = now.getTime() - latestSubmission.createdAt.getTime();
    const cooldownMs = limits.cooldownHours * 60 * 60 * 1000;
    if (elapsedMs < cooldownMs) {
      const minutesLeft = Math.ceil((cooldownMs - elapsedMs) / 1000 / 60);
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
      and(eq(submissions.userId, userId), gte(submissions.createdAt, today)),
    );

  const totalSubmissionsCount = totalSubmissionsRes[0]?.totalSubmissions ?? 0;

  const maxSubmissionsPerDay =
    task?.isHighValue === true
      ? limits.maxHighValuePerDay
      : limits.maxSubmissionsPerDay;

  if (totalSubmissionsCount >= maxSubmissionsPerDay) {
    throw new SubmissionRejectedError(
      `You have reached the daily limit of ${maxSubmissionsPerDay} submissions.`,
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
          gte(submissions.createdAt, today),
          eq(tasks.isHighValue, true),
        ),
      );

    const totalHighValue = result[0]?.totalHighValue ?? 0;

    if (totalHighValue >= limits.maxHighValuePerDay) {
      throw new SubmissionRejectedError(
        "You can only submit one high-value task per day.",
        429,
      );
    }
  }
}
