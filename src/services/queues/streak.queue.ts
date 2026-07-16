import { Queue, Worker } from "bullmq";
import redisClient from "@/redis";
import { runStreakBreakSweep } from "../economy/streaks";

type SweepJobData = Record<string, never>;

export const streakSweepQueue = new Queue<SweepJobData>("streak-sweep", {
  connection: redisClient,
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

export const streakSweepWorker = new Worker<SweepJobData>(
  "streak-sweep",
  async () => {
    await runStreakBreakSweep();
  },
  { connection: redisClient, concurrency: 1 },
);

streakSweepWorker.on("failed", (job, err) => {
  console.error(`streak-sweep failed job=${job?.id}:`, err);
});
