import { db } from "@/db";
import { submissionLimits } from "@/db/schema/rail2";

export async function seedSubmissionLimits() {
  const existing = await db.query.submissionLimits.findFirst();

  if (existing) {
    return;
  }

  await db.insert(submissionLimits).values({
    cooldownHours: 21600000,
    maxSubmissionsPerDay: 5,
    maxHighValuePerDay: 1,
    monthlyTallyCap: 1000,
    streakEnabled: true,
  });

  console.log("✓ Seeded submission limits");
}
