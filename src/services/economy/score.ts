import { format } from "date-fns";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  monthlyTally,
  participantProfile,
  pointsLedger,
  scoreHistory,
  sustainabilityScore,
  userStreaks,
} from "@/db/schema/bigwater";

import { getBandForMonthlyTally } from "./bands";
import { getBonusForStreak } from "./streaks";

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
    .update(participantProfile)
    .set({
      currentBand: band.name,
      updatedAt: now,
    })
    .where(eq(participantProfile.userId, userId));

  await tx
    .update(monthlyTally)
    .set({
      band: band.name,
      multiplier: band.multiplier,
      updatedAt: now,
    })
    .where(and(eq(monthlyTally.userId, userId), eq(monthlyTally.month, month)));
}

export async function bankMonthlyScoreForUser(
  tx: Tx,
  userId: string,
  month: string,
) {
  const tally = await tx.query.monthlyTally.findFirst({
    where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.month, month)),
  });
  if (!tally || tally.isFinalized) return;

  const streak = await tx.query.userStreaks.findFirst({
    where: eq(userStreaks.userId, userId),
  });
  const streakBonusPercent = streak
    ? await getBonusForStreak(streak.currentStreak)
    : 0;

  const bankedAmount = Math.floor(
    (tally.baseTally * tally.multiplier * (100 + streakBonusPercent)) / 10000,
  );

  const score = await tx.query.sustainabilityScore.findFirst({
    where: eq(sustainabilityScore.userId, userId),
  });
  const newTotal = (score?.totalScore ?? 0) + bankedAmount;

  await tx
    .insert(sustainabilityScore)
    .values({ userId, totalScore: newTotal, lastBankedMonth: month })
    .onConflictDoUpdate({
      target: sustainabilityScore.userId,
      set: {
        totalScore: newTotal,
        lastBankedMonth: month,
        updatedAt: new Date(),
      },
    });

  await tx.insert(scoreHistory).values({
    userId,
    month,
    tally: tally.baseTally,
    band: tally.band,
    multiplier: tally.multiplier,
    streakBonusPercent,
    bankedAmount,
    resultingScore: newTotal,
  });

  await tx
    .update(monthlyTally)
    .set({ bankedAmount, isFinalized: true, updatedAt: new Date() })
    .where(and(eq(monthlyTally.userId, userId), eq(monthlyTally.month, month)));
}

export async function runMonthEndBanking(month: string) {
  const tallies = await db.query.monthlyTally.findMany({
    where: (t, { and, eq }) =>
      and(eq(t.month, month), eq(t.isFinalized, false)),
  });
  for (const t of tallies) {
    await db.transaction((tx) => bankMonthlyScoreForUser(tx, t.userId, month));
  }
}
