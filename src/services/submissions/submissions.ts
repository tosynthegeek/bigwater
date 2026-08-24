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
import { detectAndValidateImage } from "@/lib/file-validation";

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
    throw new Error(
      `Insert into submissions returned no row for taskId=${taskId}, userId=${userId}`,
    );
  }

  return { submission, task };
}

export async function getSubmissionById(id: string) {
  return db.query.submissions.findFirst({
    where: eq(submissions.id, id),
  });
}
