import { type Context } from "hono";
import { createSubmission } from "@/services/submissions/submissions";
import { getParticipantProfileByUserId } from "@/services/identity";
import { db } from "@/db";
import { submissions, tasks } from "@/db/schema/bigwater";
import { eq } from "drizzle-orm";
import { SubmissionRejectedError } from "@/utils/errors";

export async function submitProof(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.formData();
  const taskIdOrCustom = body.get("taskIdOrCustom");
  const file = body.get("file");

  if (!taskIdOrCustom || typeof taskIdOrCustom !== "string") {
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

    const submission = await createSubmission(
      user.id,
      taskIdOrCustom,
      file,
      "web",
    );

    // call the ai model

    return c.json({ submission }, 201);
  } catch (error) {
    if (error instanceof SubmissionRejectedError) {
      return c.json({ error: error.message }, error.status);
    }
    console.error("Submissions.Controllers.submitProof.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getCustomSubmissions(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const submissions = await db.query.submissions.findMany({
      where: (submissions, { eq, isNull }) =>
        eq(submissions.userId, user.id) && isNull(submissions.taskId),
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
      where: (submissions, { eq }) =>
        eq(submissions.id, submissionId) && eq(submissions.userId, user.id),
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
  const aiConfidence = body.aiConfidence;

  if (
    typeof aiConfidence !== "number" ||
    aiConfidence < 0 ||
    aiConfidence > 100
  ) {
    return c.json(
      { error: "aiConfidence must be a number between 0 and 100." },
      400,
    );
  }

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
