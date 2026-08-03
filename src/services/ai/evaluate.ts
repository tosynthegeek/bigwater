import { db } from "@/db";
import { checkTaskRelevance } from "./relevance";
import { submissions } from "@/db/schema/rail2";
import { eq } from "drizzle-orm";

export async function evaluateSubmission(
  submissionId: string,
  imageUrl: string,
  taskDescription: string,
  taskTitle: string,
) {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(
      `Failed to fetch submission image (${imageUrl}): ${imageRes.status}`,
    );
  }

  const buf = await imageRes.arrayBuffer();
  const mimeType = imageRes.headers.get("content-type") ?? "image/jpeg";
  const file = new File([buf], "submission", { type: mimeType });

  const { score, sentence } = await checkTaskRelevance(
    file,
    taskDescription,
    taskTitle,
  );

  const [submission] = await db
    .update(submissions)
    .set({
      aiConfidence: score,
      aiVerdict: sentence,
      status: "under_review",
    })
    .where(eq(submissions.id, submissionId))
    .returning();

  if (!submission) {
    throw new Error(
      `Submission ${submissionId} not found during AI evaluation update`,
    );
  }

  return submission;
}
