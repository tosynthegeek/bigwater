import { processApprovedSubmission } from "@/services/economy/score";
import type { Context } from "hono";

import { db } from "@/db";
import { participantProfile, submissions, tasks } from "@/db/schema/rail2";
import { desc, eq } from "drizzle-orm";
import { updateUserStreak } from "@/services/economy/streaks";
import { rail1Users } from "@/db/schema/rail1";
import { relevanceRes } from "@/services/ai/relevance";

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

      if (status === "approved") {
        const task = await tx.query.tasks.findFirst({
          where: eq(tasks.id, submission.taskId),
        });

        if (!task) {
          return c.json({ error: "Invalid task ID for submission" }, 400);
        }

        await processApprovedSubmission(
          tx,
          submission.userId,
          submission.id,
          task.basePoints,
        );
        await updateUserStreak(tx, submission.userId, submission.createdAt);
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
        basePoints: tasks.basePoints,
        aiConfidence: submissions.aiConfidence,
        aiVerdict: submissions.aiVerdict,
        createdAt: submissions.createdAt,
        updatedAt: submissions.updatedAt,

        taskTitle: tasks.title,

        username: participantProfile.username,
        walletAddress: rail1Users.walletAddress,
      })
      .from(submissions)
      .leftJoin(tasks, eq(submissions.taskId, tasks.id))
      .leftJoin(
        participantProfile,
        eq(submissions.userId, participantProfile.userId),
      )
      .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
      .where(eq(submissions.status, "under_review"))
      .orderBy(desc(submissions.createdAt));

    const submissionsReadyForReview = result.map((submission) => ({
      ...submission,
      taskId: submission.taskId ?? "custom",
      taskTitle: submission.taskId ? submission.taskTitle : "Custom",
      modelRelevance: Array.from(
        relevanceRes.get(submission.id)?.values() ?? [],
      ),
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
