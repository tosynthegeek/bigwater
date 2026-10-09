import { ONE_MINUTE } from "@/utils/time";

// Strictly positive — used for things where 0 makes no sense (e.g. dayPeriodMs).
function positiveMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid period ms (must be > 0): ${JSON.stringify(raw)}`);
  }
  return n;
}

// Non-negative — used for tallyPeriodMs, where 0 is a legal, meaningful
// value ("use calendar months"). Do NOT swap this for positiveMs: an
// explicit TALLY_PERIOD_MS=0 in prod must not throw.
function nonNegativeMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid period ms (must be >= 0): ${JSON.stringify(raw)}`);
  }
  return n;
}

export const timeframes = {
  dayPeriodMs: positiveMs(process.env.DAY_PERIOD_MS, 24 * 60 * 60 * 1000),
  // 0 = calendar month (prod). >0 = fixed-length staging periods.
  tallyPeriodMs: resolveTallyPeriodMs(),
  weeklyPeriodMs: nonNegativeMs(process.env.WEEKLY_PERIOD_MS, 0),
};

export function resolveTallyPeriodMs(): number {
  // Explicit env value always wins — including "0", which means
  // "use calendar months" and must NOT be treated as unset.
  if (
    process.env.TALLY_PERIOD_MS !== undefined &&
    process.env.TALLY_PERIOD_MS !== ""
  ) {
    return nonNegativeMs(process.env.TALLY_PERIOD_MS, 0);
  }
  // No env var set at all:
  if (process.env.NODE_ENV === "production") return 0; // calendar months
  return 10 * ONE_MINUTE; // staging/dev default — override via TALLY_PERIOD_MS
}

// Callers that treat 0 as "calendar mode" (getTallyPeriod, getWeekPeriod)
// already branch on `> 0` before calling this, so rejecting 0 here is safe:
// it only turns a would-be Infinity/NaN index into a loud error.
export function periodIndex(date: Date, periodMs: number) {
  if (!Number.isFinite(periodMs) || periodMs <= 0) {
    throw new Error("periodMs must be a positive finite number");
  }
  return Math.floor(date.getTime() / periodMs);
}
