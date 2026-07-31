import { db } from "@/db";
import { checkAiGenerated } from "./generated";
import {
  checkTaskRelevance,
  checkTaskRelevanceAcrossModels,
} from "./relevance";
import { submissions } from "@/db/schema/rail2";
import { eq } from "drizzle-orm";

export async function evaluateSubmission(
  submissionId: string,
  imageUrl: string,
  taskDescription: string,
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

  const [aiGenResult, relevanceResult] = await Promise.allSettled([
    checkAiGenerated(file),
    checkTaskRelevance(file, taskDescription),

    checkTaskRelevanceAcrossModels(submissionId, file, taskDescription),
  ]);

  const authenticity =
    aiGenResult.status === "fulfilled" ? aiGenResult.value : null;
  const relevance =
    relevanceResult.status === "fulfilled" ? relevanceResult.value : null;

  if (aiGenResult.status === "rejected") {
    console.error("Sightengine check failed:", aiGenResult.reason);
  }
  if (relevanceResult.status === "rejected") {
    console.error("Claude relevance check failed:", relevanceResult.reason);
  }

  if (!authenticity && !relevance) {
    throw new Error("Both AI verification checks failed");
  }

  const scores = [authenticity?.score, relevance?.score].filter(
    (s): s is number => typeof s === "number",
  );
  const aiConfidence = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );

  const sentences = [authenticity?.sentence, relevance?.sentence].filter(
    (s): s is string => Boolean(s),
  );
  const aiVerdict = sentences.join(" ");

  const [submission] = await db
    .update(submissions)
    .set({
      aiConfidence,
      aiVerdict,
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
