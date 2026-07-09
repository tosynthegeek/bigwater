import { format } from "date-fns";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { monthlyTally, pointsLedger } from "@/db/schema/bigwater";

import { getBandForMonthlyTally } from "./bands";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function processApprovedSubmission(
  tx: Tx,
  userId: string,
  submissionId: string,
  basePoints: number,
) {
  const now = new Date();
  const month = format(now, "yyyy-MM");

  await tx.insert(pointsLedger).values({
    userId,
    submissionId,
    basePoints,
    month,
  });

  await tx
    .insert(monthlyTally)
    .values({
      userId,
      month,
      baseTally: basePoints,
    })
    .onConflictDoUpdate({
      target: [monthlyTally.userId, monthlyTally.month],
      set: {
        baseTally: sql`${monthlyTally.baseTally} + ${basePoints}`,
        updatedAt: now,
      },
    });

  const tally = await tx.query.monthlyTally.findFirst({
    where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.month, month)),
  });

  if (!tally) {
    throw new Error("Monthly tally not found.");
  }

  const band = await getBandForMonthlyTally(tally.baseTally);

  await tx
    .update(monthlyTally)
    .set({
      band: band.name,
      multiplier: band.multiplier,
      updatedAt: now,
    })
    .where(eq(monthlyTally.userId, userId));
}
