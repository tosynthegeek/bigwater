import { db } from "@/db";
import { submissions, tasks } from "@/db/schema/rail2";
import { and, desc, eq } from "drizzle-orm";
import { uploadFileToS3 } from "@/services/s3";
import { SubmissionRejectedError } from "@/utils/errors";
import { enforceSubmissionLimits } from "./submission-limits";
import { detectAndValidateImage } from "@/lib/file-validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SubmissionStatus = "approved" | "rejected" | "under_review" | "pending";

export async function createSubmission(
  userId: string,
  taskId: string,
  image: File,
  source: "telegram" | "web",
) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) {
    throw new SubmissionRejectedError("Selected task does not exist.");
  }

  const taskInfo = { id: task.id, isHighValue: task.isHighValue };

  await enforceSubmissionLimits(userId, taskInfo);

  // Authoritative content-based validation — never trust the client-supplied
  // File.type. Runs before any storage write so a rejected file never lands
  // in S3/disk.
  const validation = await detectAndValidateImage(image);
  if (!validation.ok) {
    throw new SubmissionRejectedError(validation.reason, 400);
  }

  const fileId = await uploadFileToS3(image, validation.ext, validation.mime);

  const [submission] = await db
    .insert(submissions)
    .values({
      userId,
      taskId: task.id,
      source,
      status: "pending",
      imageUrl: fileId,
    })
    .returning();

  if (!submission) {
    console.error(
      `Failed to create submission for task ${task.title} by user ${userId}`,
    );
    throw new SubmissionRejectedError(
      `Failed to create submission for task ${task.title}. Please try again later.`,
    );
  }

  return { submission, task };
}

export async function getSubmissionById(id: string) {
  return db.query.submissions.findFirst({
    where: eq(submissions.id, id),
  });
}

export async function getUserSubmissions(userId: string) {
  const rows = await db
    .select({
      submission: submissions,
      taskTitle: tasks.title,
      basePoints: tasks.basePoints,
    })
    .from(submissions)
    .leftJoin(tasks, eq(submissions.taskId, tasks.id))
    .where(eq(submissions.userId, userId))
    .orderBy(desc(submissions.createdAt));

  const result = rows.map(({ submission, taskTitle, basePoints }) => ({
    ...submission,
    taskId: submission.taskId,
    taskTitle: taskTitle,
    basePoints: basePoints ?? 0,
  }));

  return result;
}

export async function getUserSubmissionsWithStatus(
  userId: string,
  status?: SubmissionStatus,
) {
  const rows = await db
    .select({
      submission: submissions,
      taskTitle: tasks.title,
      basePoints: tasks.basePoints,
    })
    .from(submissions)
    .leftJoin(tasks, eq(submissions.taskId, tasks.id))
    .where(
      status
        ? and(eq(submissions.userId, userId), eq(submissions.status, status))
        : eq(submissions.userId, userId),
    )
    .orderBy(desc(submissions.createdAt));

  return rows.map(({ submission, taskTitle, basePoints }) => ({
    ...submission,
    taskTitle,
    basePoints: basePoints ?? 0,
  }));
}

export async function isUserFirstSubmission(userId: string) {
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.userId, userId),
    columns: {
      id: true,
    },
  });

  return submission === undefined;
}
