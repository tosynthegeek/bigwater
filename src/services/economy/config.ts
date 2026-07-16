export const timeframes = {
  submissionCooldownMs: Number(
    process.env.SUBMISSION_COOLDOWN_MS ?? 6 * 60 * 60 * 1000,
  ),
  dayPeriodMs: Number(process.env.DAY_PERIOD_MS ?? 24 * 60 * 60 * 1000),
  tallyPeriodMs: Number(process.env.TALLY_PERIOD_MS ?? 0),
  weeklyPeriodMs: Number(process.env.WEEKLY_PERIOD_MS ?? 0), // 0 = real ISO week (Mon–Sun); >0 = fixed-length period for staging
};

export function periodIndex(date: Date, periodMs: number) {
  if (periodMs <= 0) {
    throw new Error("periodMs must be greater than zero");
  }

  return Math.floor(date.getTime() / periodMs);
}
