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

  const taskInfo = { id: task.id, isHighValue: task.isHighValue };

  await enforceSubmissionLimits(userId, taskInfo);

  const fileId = await uploadFileToS3(image);

  // Demo mode: the external AI verification microservice is not deployed, so
  // nothing would ever move a submission from "pending" to "under_review" and
  // it could never reach the admin review queue. When DEMO_AUTO_REVIEW=true we
  // stamp a synthetic verdict and route straight to "under_review" so the
  // submit -> review -> approve loop is demoable end-to-end. In production
  // (flag unset/false) behaviour is unchanged: submissions land as "pending"
  // and wait for the real AI service to review them.
  const demoAutoReview = Bun.env.DEMO_AUTO_REVIEW === "true";

  const [submission] = await db
    .insert(submissions)
    .values({
      userId,
      taskId: task.id,
      source,
      status: demoAutoReview ? "under_review" : "pending",
      imageUrl: fileId,
      aiConfidence: demoAutoReview ? 95 : null,
      aiVerdict: demoAutoReview ? "auto-review (demo mode)" : null,
    })
    .returning();

  return submission;
}

export async function getSubmissionById(id: string) {
  return db.query.submissions.findFirst({
    where: eq(submissions.id, id),
  });
}
