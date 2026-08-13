import { db } from "@/db";
import {
  monthlyTally,
  participantProfile,
  pointsLedger,
  submissions,
  tasks,
} from "@/db/schema/rail2";
import { eq, sql } from "drizzle-orm";
import { uploadFileToS3 } from "@/services/s3";
import { format } from "date-fns";
import { SubmissionRejectedError } from "@/utils/errors";
import { enforceSubmissionLimits } from "./submission-limits";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

  const fileId = await uploadFileToS3(image);

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
