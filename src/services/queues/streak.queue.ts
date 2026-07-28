import { Queue } from "bullmq";
import { makeConnection } from "@/redis";

export type SweepJobData = Record<string, never>;

export const streakSweepQueue = new Queue<SweepJobData>("streak-sweep", {
  connection: makeConnection(),
});

export async function scheduleStreakSweep() {
  await streakSweepQueue.add(
    "sweep",
    {},
    {
      repeat: { every: Number(process.env.STREAK_SWEEP_INTERVAL_MS ?? 60_000) },
      jobId: "streak-sweep",
    },
  );
}
