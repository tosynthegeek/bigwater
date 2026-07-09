import { db } from "@/db";

export async function getSubmissionLimits() {
  const limits = await db.query.submissionLimits.findFirst();

  if (!limits) {
    throw new Error("Submission limits not configured");
  }

  return limits;
}
