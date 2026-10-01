import { processApprovedSubmission } from "@/services/economy/score";
import type { Context } from "hono";

import { db } from "@/db";
import {
  participantProfile,
  submissions,
  tasks,
  type User,
} from "@/db/schema/rail2";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { updateUserStreak } from "@/services/economy/streaks";
import { rail1Users } from "@/db/schema/rail1";
import { relevanceRes } from "@/services/ai/relevance";
import { submissionNotificationQueue } from "@/services/queues/notification.queue";
import { setAuditMeta } from "@/services/logger/audit";

class ReviewError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

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
        throw new ReviewError(404, `Submission ${submissionId} not found`);
      }

      if (submission.status !== "under_review") {
        throw new ReviewError(
          409,
          `Submission not ready for review, current status ${submission.status}`,
        );
      }

      if (status === "approved") {
        const task = await tx.query.tasks.findFirst({
          where: eq(tasks.id, submission.taskId),
        });

        if (!task) {
          throw new ReviewError(400, "Invalid task ID for submission");
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
        .where(
          and(
            eq(submissions.id, submission.id),
            eq(submissions.status, "under_review"),
          ),
        )
        .returning();

      if (!updatedSubmission) {
        throw new ReviewError(409, "Submission was already reviewed");
      }

      const pProfile = await tx.query.participantProfile.findFirst({
        where: eq(participantProfile.userId, updatedSubmission.userId),
        columns: {
          id: true,
        },
      });

      if (!pProfile) {
        throw new Error(
          `Participant profile not found for userId ${updatedSubmission.userId}`,
        );
      }

      const previousApprovedSubmission = await tx.query.submissions.findFirst({
        where: and(
          eq(submissions.userId, submission.userId),
          eq(submissions.status, "approved"),
          ne(submissions.id, submission.id),
        ),
        columns: {
          id: true,
        },
      });

      const isFirstApprovedSubmission =
        previousApprovedSubmission === undefined;

      const previousSubmission = await tx.query.submissions.findFirst({
        where: and(
          eq(submissions.userId, submission.userId),
          ne(submissions.id, submission.id),
        ),
        columns: {
          id: true,
        },
      });

      const isFirstSubmission = previousSubmission === undefined;

      await submissionNotificationQueue.add(
        "notify",
        {
          userId: updatedSubmission.userId,
          taskId: updatedSubmission.taskId,
          status: updatedSubmission.status,
          verdict: updatedSubmission.aiVerdict,
          isFirstSubmission,
          isFirstApprovedSubmission,
        },
        { jobId: `notify-${updatedSubmission.id}` },
      );

      const submissionResponse = {
        ...updatedSubmission,
        participantProfileId: pProfile.id,
      };

      return submissionResponse;
    });

    setAuditMeta(c, {
      decision: status,
      submissionUserId: updatedSubmission.userId,
      taskId: updatedSubmission.taskId,
    });

    return c.json({ submission: updatedSubmission });
  } catch (error) {
    if (error instanceof ReviewError) {
      return c.json({ error: error.message }, error.status);
    }
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
        participantId: participantProfile.id,
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

export async function getApprovedAndRejectedSubmissions(c: Context) {
  const user = c.get("user") as User;

  if (!user || (user.role != "superadmin" && user.role != "admin")) {
    return c.json({ error: "Unauthorized access" }, 401);
  }

  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

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
        participantId: participantProfile.id,
        walletAddress: rail1Users.walletAddress,
      })
      .from(submissions)
      .leftJoin(tasks, eq(submissions.taskId, tasks.id))
      .leftJoin(
        participantProfile,
        eq(submissions.userId, participantProfile.userId),
      )
      .leftJoin(rail1Users, eq(rail1Users.id, participantProfile.rail1UserId))
      .where(inArray(submissions.status, ["approved", "rejected"]))
      .orderBy(desc(submissions.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json(
      {
        submissions: result,
        pagination: {
          limit,
          offset,
          hasMore: result.length === limit,
        },
      },
      200,
    );
  } catch (error) {
    console.error(
      "AdminControllers.getApprovedAndRejectedSubmissions.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}
