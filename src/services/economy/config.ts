import { ONE_MINUTE } from "@/utils/time";

export const timeframes = {
  dayPeriodMs: Number(process.env.DAY_PERIOD_MS ?? 24 * 60 * 60 * 1000),
  tallyPeriodMs: resolveTallyPeriodMs(),
  weeklyPeriodMs: Number(process.env.WEEKLY_PERIOD_MS ?? 0), // 0 = real ISO week (Mon–Sun); >0 = fixed-length period for staging
};

export function periodIndex(date: Date, periodMs: number) {
  if (periodMs <= 0) {
    throw new Error("periodMs must be greater than zero");
  }

  return Math.floor(date.getTime() / periodMs);
}

export function resolveTallyPeriodMs(): number {
  if (process.env.TALLY_PERIOD_MS) {
    return Number(process.env.TALLY_PERIOD_MS);
  }
  return process.env.NODE_ENV === "production" ? 0 : 60 * ONE_MINUTE;
}
