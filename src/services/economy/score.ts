import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  monthlyTally,
  participantProfile,
  pointsLedger,
  scoreHistory,
  sustainabilityScore,
  userStreaks,
} from "@/db/schema/rail2";

import { getBandForMonthlyTally } from "./bands";
import { getBonusForStreak } from "./streaks";
import { getTallyPeriod } from "./tally";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function processApprovedSubmission(
  tx: Tx,
  userId: string,
  submissionId: string,
  pointsAwarded: number,
) {
  const now = new Date();
  const { key: month, end: periodEnd } = getTallyPeriod(now);

  await tx.insert(pointsLedger).values({
    userId,
    submissionId,
    basePoints: pointsAwarded,
    month,
  });

  await tx
    .insert(monthlyTally)
    .values({
      userId,
      month,
      baseTally: pointsAwarded,
      periodEnd,
    })
    .onConflictDoUpdate({
      target: [monthlyTally.userId, monthlyTally.month],
      set: {
        baseTally: sql`${monthlyTally.baseTally} + ${pointsAwarded}`,
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
    .where(and(eq(monthlyTally.userId, userId), eq(monthlyTally.month, month)));
}

export async function bankMonthlyScoreForUser(
  tx: Tx,
  userId: string,
  month: string,
) {
  const [claimed] = await tx
    .update(monthlyTally)
    .set({ isFinalized: true, updatedAt: new Date() })
    .where(
      and(
        eq(monthlyTally.userId, userId),
        eq(monthlyTally.month, month),
        eq(monthlyTally.isFinalized, false),
      ),
    )
    .returning();

  if (!claimed) return;

  const streak = await tx.query.userStreaks.findFirst({
    where: eq(userStreaks.userId, userId),
  });
  const streakBonusPercent = streak
    ? await getBonusForStreak(streak.currentStreak)
    : 0;

  const BASIS = 100;
  const bankedAmount = Math.floor(
    (claimed.baseTally * claimed.multiplier * (BASIS + streakBonusPercent)) /
      (BASIS * BASIS),
  );

  const score = await tx.query.sustainabilityScore.findFirst({
    where: eq(sustainabilityScore.userId, userId),
  });
  const startingScore = score?.totalScore ?? 0;
  const newTotal = startingScore + bankedAmount;

  await tx
    .insert(sustainabilityScore)
    .values({ userId, totalScore: newTotal })
    .onConflictDoUpdate({
      target: sustainabilityScore.userId,
      set: { totalScore: newTotal, updatedAt: new Date() },
    });

  await tx.insert(scoreHistory).values({
    userId,
    month,
    tally: claimed.baseTally,
    band: claimed.band,
    multiplier: claimed.multiplier,
    streakBonusPercent,
    startingScore,
    bankedAmount,
    resultingScore: newTotal,
  });

  await tx
    .update(monthlyTally)
    .set({ bankedAmount })
    .where(eq(monthlyTally.id, claimed.id));
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
