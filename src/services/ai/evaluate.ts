import { db } from "@/db";
import { checkTaskRelevance } from "./relevance";
import { submissions } from "@/db/schema/rail2";
import { eq } from "drizzle-orm";
import { checkAiGenerated } from "./generated";

const RED_FLAG_THRESHOLD = 40; // below this, a score is "drastically poor"
const RED_FLAG_CAP_MULTIPLIER = 1.25; // caps the final score at (weakest * this)

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

  const [authenticityResult, relevanceResult] = await Promise.allSettled([
    withRetry(() => checkAiGenerated(file), "authenticity check"),
    withRetry(
      () => checkTaskRelevance(file, taskDescription, taskTitle),
      "relevance check",
    ),
  ]);

  if (
    authenticityResult.status === "rejected" ||
    relevanceResult.status === "rejected"
  ) {
    const reasons: string[] = [];
    if (authenticityResult.status === "rejected") {
      reasons.push(String(authenticityResult.reason));
    }
    if (relevanceResult.status === "rejected") {
      reasons.push(String(relevanceResult.reason));
    }

    throw new Error(
      `Submission ${submissionId} evaluation incomplete, refusing to score from partial results: ${reasons.join(" | ")}`,
    );
  }

  const { score, sentence } = combineScores(
    relevanceResult.value,
    authenticityResult.value,
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

function combineScores(
  relevance: { score: number; sentence: string },
  authenticity: { score: number; sentence: string },
) {
  const geoMean = Math.sqrt(relevance.score * authenticity.score);

  const weakest = Math.min(relevance.score, authenticity.score);

  const cappedScore =
    weakest < RED_FLAG_THRESHOLD
      ? Math.min(geoMean, weakest * RED_FLAG_CAP_MULTIPLIER)
      : geoMean;

  const score = Math.round(Math.min(100, Math.max(0, cappedScore)));

  let sentence: string;
  if (
    authenticity.score < RED_FLAG_THRESHOLD &&
    relevance.score < RED_FLAG_THRESHOLD
  ) {
    sentence =
      "The image is unrelated to the task and shows strong signs of AI generation.";
  } else if (authenticity.score < RED_FLAG_THRESHOLD) {
    sentence =
      "The image appears relevant but shows strong signs of AI generation.";
  } else if (relevance.score < RED_FLAG_THRESHOLD) {
    sentence =
      "The image appears authentic but does not provide sufficient evidence that the task was completed.";
  } else {
    sentence = relevance.sentence;
  }

  return { score, sentence };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 2,
  delayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw new Error(
    `${label} failed after ${retries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
