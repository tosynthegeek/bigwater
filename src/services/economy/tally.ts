import {
  addMonths,
  addWeeks,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { periodIndex, timeframes } from "./config";

export function getTallyPeriod(date: Date = new Date()) {
  if (timeframes.tallyPeriodMs > 0) {
    const idx = periodIndex(date, timeframes.tallyPeriodMs);
    return {
      key: `p${idx}`,
      start: new Date(idx * timeframes.tallyPeriodMs),
      end: new Date((idx + 1) * timeframes.tallyPeriodMs),
    };
  }
  const start = startOfMonth(date);
  return { key: format(start, "yyyy-MM"), start, end: addMonths(start, 1) };
}

export function getWeekPeriod(date: Date) {
  if (timeframes.weeklyPeriodMs > 0) {
    const idx = periodIndex(date, timeframes.weeklyPeriodMs);
    return {
      start: new Date(idx * timeframes.weeklyPeriodMs),
      end: new Date((idx + 1) * timeframes.weeklyPeriodMs),
    };
  }
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return { start, end: addWeeks(start, 1) };
}
