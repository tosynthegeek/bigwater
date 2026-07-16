import { db } from "@/db";
import { and, asc } from "drizzle-orm";
import { userStreaks, streakBonuses } from "@/db/schema/bigwater";
import { eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function startOfUtcDay(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function diffInDays(a: Date, b: Date) {
  return Math.floor(
    (startOfUtcDay(a).getTime() - startOfUtcDay(b).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

export async function updateUserStreak(tx: Tx, userId: string) {
  const now = new Date();

  const streak = await tx.query.userStreaks.findFirst({
    where: eq(userStreaks.userId, userId),
  });

  if (!streak) {
    await tx.insert(userStreaks).values({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: now,
    });

    return;
  }

  if (!streak.lastActivityDate) {
    await tx
      .update(userStreaks)
      .set({
        currentStreak: 1,
        longestStreak: sql`GREATEST(${userStreaks.longestStreak},1)`,
        lastActivityDate: now,
        updatedAt: now,
      })
      .where(eq(userStreaks.userId, userId));

    return;
  }

  const days = diffInDays(now, streak.lastActivityDate);

  // already counted today
  if (days === 0) {
    return;
  }

  // consecutive day
  if (days === 1) {
    await tx
      .update(userStreaks)
      .set({
        currentStreak: sql`${userStreaks.currentStreak} + 1`,
        longestStreak: sql`GREATEST(${userStreaks.longestStreak}, ${userStreaks.currentStreak} + 1)`,
        lastActivityDate: now,
        updatedAt: now,
      })
      .where(eq(userStreaks.userId, userId));

    return;
  }

  // streak broken
  await tx
    .update(userStreaks)
    .set({
      currentStreak: 1,
      lastActivityDate: now,
      updatedAt: now,
    })
    .where(eq(userStreaks.userId, userId));
}

export async function getStreakBonuses() {
  return db.query.streakBonuses.findMany({
    orderBy: asc(streakBonuses.streakDays),
  });
}

export async function getBonusForStreak(days: number) {
  const bonuses = await getStreakBonuses();

  let current = 0;

  for (const bonus of bonuses) {
    if (days >= bonus.streakDays) {
      current = bonus.bonusPercent;
    }
  }

  return current;
}

export async function runDailyStreakReset() {
  const now = new Date();
  const yesterdayStart = new Date(
    startOfUtcDay(now).getTime() - 24 * 60 * 60 * 1000,
  );

  await db
    .update(userStreaks)
    .set({ currentStreak: 0, updatedAt: now })
    .where(
      and(
        sql`${userStreaks.lastActivityDate} < ${yesterdayStart}`,
        sql`${userStreaks.currentStreak} > 0`,
      ),
    );
}
