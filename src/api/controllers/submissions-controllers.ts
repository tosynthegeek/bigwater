import { type Context } from "hono";
import { createSubmission } from "@/services/submissions/submissions";
import { getParticipantProfileByUserId } from "@/services/identity";
import { db } from "@/db";
import { submissions, tasks } from "@/db/schema/rail2";
import { eq } from "drizzle-orm";
import { SubmissionRejectedError } from "@/utils/errors";
import { getSubmissionLimitStatus } from "@/services/submissions/submission-limits";
import { updateSubmissionAiConfidenceSchema } from "@/zod/submission";
import { submissionEvaluationQueue } from "@/services/queues/evaluation.queue";

export async function submitProof(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.formData();
  const taskId = body.get("taskId");
  const file = body.get("file");

  if (!taskId || typeof taskId !== "string") {
    return c.json({ error: "Invalid task selection" }, 400);
  }

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Invalid or missing file upload." }, 400);
  }

  try {
    const profile = await getParticipantProfileByUserId(user.id);
    if (!profile) {
      return c.json({ error: "Profile not found" }, 404);
    }

    if (profile.isFlagged) {
      return c.json(
        { error: "Your account has been flagged and cannot submit proofs." },
        403,
      );
    }

    const { submission, task } = await createSubmission(
      user.id,
      taskId,
      file,
      "web",
    );

    await submissionEvaluationQueue.add(
      "evaluate",
      {
        submissionId: submission.id,
        imageUrl: submission.imageUrl,
        taskTitle: task.title,
        taskDescription: task.description,
      },
      { jobId: submission.id },
    );

    return c.json({ submission }, 201);
  } catch (error) {
    if (error instanceof SubmissionRejectedError) {
      return c.json({ error: error.message }, error.status);
    }
    console.error("Submissions.Controllers.submitProof.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/// will be removed
export async function getCustomSubmissions(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const submissions = await db.query.submissions.findMany({
      where: (submissions, { and, eq, isNull }) =>
        and(eq(submissions.userId, user.id), isNull(submissions.taskId)),
      orderBy: (submissions, { desc }) => desc(submissions.createdAt),
    });
    return c.json({ submissions });
  } catch (error) {
    console.error(
      "Submissions.Controllers.getCustomSubmissions.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getSubmissionById(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const submissionId = c.req.param("id");
  if (!submissionId) {
    return c.json({ error: "Submission ID is required" }, 400);
  }

  try {
    const submission = await db.query.submissions.findFirst({
      where: (submissions, { and, eq }) =>
        and(eq(submissions.id, submissionId), eq(submissions.userId, user.id)),
    });

    if (!submission) {
      return c.json({ error: "Submission not found" }, 404);
    }

    return c.json({ submission });
  } catch (error) {
    console.error("Submissions.Controllers.getSubmissionById.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function updateSubmissionAiConfidence(c: Context) {
  const submissionId = c.req.param("id");
  if (!submissionId) {
    return c.json({ error: "Submission ID is required" }, 400);
  }

  const body = await c.req.json();
  const validatedBody = updateSubmissionAiConfidenceSchema.safeParse(body);

  if (!validatedBody.success) {
    return c.json({ error: validatedBody.error.issues }, 400);
  }

  const { aiConfidence, aiVerdict } = validatedBody.data;

  try {
    const submission = await db.query.submissions.findFirst({
      where: (submissions, { eq }) => eq(submissions.id, submissionId),
    });

    if (!submission) {
      return c.json({ error: "Submission not found" }, 404);
    }

    const [updatedSubmission] = await db
      .update(submissions)
      .set({
        aiConfidence,
        aiVerdict,
        status: "under_review",
      })
      .where(eq(submissions.id, submissionId))
      .returning();

    return c.json({ submission: updatedSubmission });
  } catch (error) {
    console.error(
      "Submissions.Controllers.updateSubmissionAiConfidence.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getSubmissionLimitsStatus(c: Context) {
  const user = c.get("user");

  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const status = await getSubmissionLimitStatus(user.id);

    return c.json(status, 200);
  } catch (error) {
    console.error(
      "Submissions.Controllers.getSubmissionLimitsStatus.error:",
      error,
    );

    return c.json({ error: "Internal server error" }, 500);
  }
}
