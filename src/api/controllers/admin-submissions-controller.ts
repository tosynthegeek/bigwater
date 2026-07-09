import { processApprovedSubmission } from "@/services/economy/score";
import type { Context } from "hono";

import { db } from "@/db";
import { submissions, tasks } from "@/db/schema/bigwater";
import { eq } from "drizzle-orm";
import { updateUserStreak } from "@/services/economy/streaks";

export async function updateSubmissionStatus(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const submissionId = c.req.param("id");
  if (!submissionId) {
    return c.json({ error: "Submission ID is required" }, 400);
  }

  const body = await c.req.json();
  const status = body.status;
  const taskId = body.taskId;

  const validStatuses = ["pending", "under_review", "approved", "rejected"];
  if (!validStatuses.includes(status)) {
    return c.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      400,
    );
  }

  try {
    const updatedSubmission = await db.transaction(async (tx) => {
      const submission = await tx.query.submissions.findFirst({
        where: eq(submissions.id, submissionId),
      });

      if (!submission) {
        return c.json(
          {
            error: `Submission ${submissionId} not found`,
          },
          404,
        );
      }

      if (submission.status !== "under_review") {
        return c.json(
          {
            error: `Submission not ready for review, current status ${submission.status}`,
          },
          409,
        );
      }

      let awardedPoints = submission.basePoints;

      if (!submission.taskId) {
        if (!taskId) {
          throw new Error("Task must be selected");
        }

        const task = await tx.query.tasks.findFirst({
          where: eq(tasks.id, taskId),
        });

        if (!task) {
          throw new Error("Task not found");
        }

        awardedPoints = task.basePoints;

        await tx
          .update(submissions)
          .set({
            taskId: task.id,
            basePoints: task.basePoints,
          })
          .where(eq(submissions.id, submission.id));
      }

      if (status === "approved") {
        await processApprovedSubmission(
          tx,
          submission.userId,
          submission.id,
          awardedPoints,
        );
        await updateUserStreak(tx, submission.userId);
      }

      const [updatedSubmission] = await tx
        .update(submissions)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, submission.id));

      return updatedSubmission;
    });

    return c.json({ submission: updatedSubmission });
  } catch (error) {
    console.error(
      "Submissions.Controllers.updateSubmissionStatus.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}
