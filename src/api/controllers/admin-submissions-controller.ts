import { processApprovedSubmission } from "@/services/economy/score";
import type { Context } from "hono";

import { db } from "@/db";
import { participantProfile, submissions, tasks } from "@/db/schema/bigwater";
import { desc, eq } from "drizzle-orm";
import { updateUserStreak } from "@/services/economy/streaks";
import { updateCustomSubmissionSchema } from "@/zod/submission";

export async function reviewSubmission(c: Context) {
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

  const validStatuses = ["approved", "rejected"];
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

      if (!submission.taskId || submission.taskId != taskId) {
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
        .where(eq(submissions.id, submission.id))
        .returning();

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

export async function updateCustomSubmission(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const submissionId = c.req.param("id");
  if (!submissionId) {
    return c.json({ error: "Submission ID is required" }, 400);
  }

  const body = await c.req.json();
  const newTaskId = body.taskId;
  const basePoints = body.basePoints;
  const validatedBody = updateCustomSubmissionSchema.safeParse({
    newTaskId,
    basePoints,
  });
  if (validatedBody.error) {
    return c.json({ error: validatedBody.error.issues }, 400);
  }

  try {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });

    if (!submission) {
      return c.json({ error: "Submission not found" }, 404);
    }

    if (submission.taskId !== null) {
      return c.json(
        { error: "This submission is already associated with a task." },
        400,
      );
    }

    const [updatedSubmission] = await db
      .update(submissions)
      .set({
        taskId: newTaskId,
        basePoints,
      })
      .where(eq(submissions.id, submissionId))
      .returning();

    return c.json({ submission: updatedSubmission });
  } catch (error) {
    console.error(
      "Submissions.Controllers.updateCustomSubmissionTaskId.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function deleteSubmission(c: Context) {
  const submissionId = c.req.param("id");

  if (!submissionId) {
    return c.json({ error: "Submission ID is required" }, 400);
  }

  try {
    const existingSub = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });

    if (!existingSub) {
      return c.json({ error: "Submission not found" }, 404);
    }

    const [deletedSub] = await db
      .delete(submissions)
      .where(eq(submissions.id, submissionId))
      .returning();

    return c.json({ submission: deletedSub }, 200);
  } catch (error) {
    console.error(
      "Admin.Controllers.deleteSubmissionController.error: ",
      error,
    );

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getReadyForReviewSubmissions(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await db
      .select({
        id: submissions.id,
        userId: submissions.userId,
        taskId: submissions.taskId,
        source: submissions.source,
        status: submissions.status,
        imageUrl: submissions.imageUrl,
        basePoints: submissions.basePoints,
        aiConfidence: submissions.aiConfidence,
        aiVerdict: submissions.aiVerdict,
        createdAt: submissions.createdAt,
        updatedAt: submissions.updatedAt,

        taskTitle: tasks.title,

        username: participantProfile.username,
        walletAddress: participantProfile.walletAddress,
      })
      .from(submissions)
      .leftJoin(tasks, eq(submissions.taskId, tasks.id))
      .leftJoin(
        participantProfile,
        eq(submissions.userId, participantProfile.userId),
      )
      .where(eq(submissions.status, "under_review"))
      .orderBy(desc(submissions.createdAt));

    const submissionsReadyForReview = result.map((submission) => ({
      ...submission,
      taskId: submission.taskId ?? "custom",
      taskTitle: submission.taskId ? submission.taskTitle : "Custom",
    }));

    return c.json({ submissionsReadyForReview }, 200);
  } catch (error) {
    console.error(
      "Admin.Controllers.getReadyForReviewSubmissions.error: ",
      error,
    );

    return c.json({ error: "Internal server error" }, 500);
  }
}
