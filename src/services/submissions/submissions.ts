import { db } from "@/db";
import {
  monthlyTally,
  participantProfile,
  pointsLedger,
  submissions,
  tasks,
} from "@/db/schema/bigwater";
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

  let taskInfo: { id: string; isHighValue: boolean } | null = null;
  if (task) {
    taskInfo = { id: task.id, isHighValue: task.isHighValue };
  }

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
      basePoints: task.basePoints,
    })
    .returning();

  return submission;
}

export async function getSubmissionById(id: string) {
  return db.query.submissions.findFirst({
    where: eq(submissions.id, id),
  });
}
