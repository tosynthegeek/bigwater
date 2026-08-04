import { db } from "@/db";
import { and, asc, gt, gte, inArray, lt } from "drizzle-orm";
import { userStreaks, streakBonuses, submissions } from "@/db/schema/rail2";
import { eq, sql } from "drizzle-orm";
import { periodIndex, timeframes } from "./config";

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

export async function updateUserStreak(
  tx: Tx,
  userId: string,
  activityDate: Date,
) {
  const activityIdx = periodIndex(activityDate, timeframes.dayPeriodMs);

  const streak = await tx.query.userStreaks.findFirst({
    where: eq(userStreaks.userId, userId),
  });

  if (!streak || !streak.lastActivityDate) {
    await tx
      .insert(userStreaks)
      .values({
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: activityDate,
      })
      .onConflictDoUpdate({
        target: userStreaks.userId,
        set: {
          currentStreak: 1,
          longestStreak: sql`GREATEST(${userStreaks.longestStreak}, 1)`,
          lastActivityDate: activityDate,
          updatedAt: new Date(),
        },
      });
    return;
  }

  const lastIdx = periodIndex(streak.lastActivityDate, timeframes.dayPeriodMs);
  console.log({
    activityDate,
    lastActivityDate: streak.lastActivityDate,
    activityIdx,
    lastIdx,
    diff: activityIdx - lastIdx,
  });
  const diff = activityIdx - lastIdx;

  if (diff === 0) {
    return;
  }

  // An approval for a day before the currently-credited day. Can happen when
  // an earlier submission's review resolves after a later one's (out-of-order
  // approvals). The streak is already ahead of this day — never let a stale
  // approval regress lastActivityDate.
  if (diff < 0) {
    return;
  }

  if (diff === 1) {
    await tx
      .update(userStreaks)
      .set({
        currentStreak: sql`${userStreaks.currentStreak} + 1`,
        longestStreak: sql`GREATEST(${userStreaks.longestStreak}, ${userStreaks.currentStreak} + 1)`,
        lastActivityDate: activityDate,
        updatedAt: new Date(),
      })
      .where(eq(userStreaks.userId, userId));

    return;
  }

  // streak broken
  await tx
    .update(userStreaks)
    .set({
      currentStreak: 1,
      lastActivityDate: activityDate,
      updatedAt: new Date(),
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

export async function runStreakBreakSweep() {
  const now = new Date();
  const cutoffIdx = periodIndex(now, timeframes.dayPeriodMs) - 1;
  const cutoff = new Date(cutoffIdx * timeframes.dayPeriodMs);

  const candidates = await db
    .select({
      userId: userStreaks.userId,
      lastActivityDate: userStreaks.lastActivityDate,
    })
    .from(userStreaks)
    .where(
      and(
        lt(userStreaks.lastActivityDate, cutoff),
        gt(userStreaks.currentStreak, 0),
      ),
    );

  if (candidates.length === 0) return;

  // For each candidate, the "grace day" is the day right after their last
  // credited activity. If a submission for that exact day is still pending
  // or under review, its outcome could still keep the streak alive — don't
  // break yet. If it's since been rejected (or never existed), it won't
  // match this filter and the user falls through to being broken below.
  const graced = new Set<string>();

  await Promise.all(
    candidates.map(async (candidate) => {
      if (!candidate.lastActivityDate) return;

      const lastIdx = periodIndex(
        candidate.lastActivityDate,
        timeframes.dayPeriodMs,
      );

      const graceStart = new Date((lastIdx + 1) * timeframes.dayPeriodMs);

      const graceEnd = new Date((lastIdx + 2) * timeframes.dayPeriodMs);

      const pendingSubmission = await db.query.submissions.findFirst({
        where: and(
          eq(submissions.userId, candidate.userId),
          inArray(submissions.status, ["pending", "under_review"]),
          gte(submissions.createdAt, graceStart),
          lt(submissions.createdAt, graceEnd),
        ),
      });

      if (pendingSubmission) {
        graced.add(candidate.userId);
      }
    }),
  );

  const toBreak = candidates
    .map((c) => c.userId)
    .filter((userId) => !graced.has(userId));

  if (toBreak.length === 0) return;

  await db
    .update(userStreaks)
    .set({ currentStreak: 0, updatedAt: now })
    .where(inArray(userStreaks.userId, toBreak));
}
