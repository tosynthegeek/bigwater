import { makeConnection } from "@/redis";
import { runStreakBreakSweep } from "../economy/streaks";
import type { SweepJobData } from "../queues/banking.queue";
import { Worker } from "bullmq";

export const streakSweepWorker = new Worker<SweepJobData>(
  "streak-sweep",
  async () => {
    await runStreakBreakSweep();
  },
  { connection: makeConnection(), concurrency: 1 },
);

streakSweepWorker.on("failed", (job, err) => {
  console.error(`streak-sweep failed job=${job?.id}:`, err);
});
streakSweepWorker.on("completed", (job) => {
  console.log(`streak-sweep completed job=${job?.id}`);
});
streakSweepWorker.on("error", (err) => {
  console.error("streak-sweep worker error", err);
});
