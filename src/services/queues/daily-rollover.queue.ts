import { Queue } from "bullmq";
import { makeConnection } from "@/redis";

export type RolloverJobData = Record<string, never>;

export const dailyRolloverQueue = new Queue<RolloverJobData>("daily-rollover", {
  connection: makeConnection(),
});

// Polls on an interval rather than a cron pattern: materializeDay() is keyed
// on the current day index and is idempotent, so a poll both fires shortly
// after the day boundary (including with a DAY_PERIOD_MS override) and
// catches up after downtime.
export async function scheduleDailyRollover() {
  await dailyRolloverQueue.add(
    "rollover",
    {},
    {
      repeat: {
        every: Number(process.env.DAILY_ROLLOVER_INTERVAL_MS ?? 300000),
      },
      jobId: "daily-rollover",
    },
  );
}
