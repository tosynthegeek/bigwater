import { Queue } from "bullmq";
import { makeConnection } from "@/redis";
import { scheduleRepeatable } from "../schedule";

export type SweepJobData = Record<string, never>;

export const streakSweepQueue = new Queue<SweepJobData>("streak-sweep", {
  connection: makeConnection(),
});

export async function scheduleStreakSweep() {
  await scheduleRepeatable(
    streakSweepQueue,
    "sweep",
    "streak-sweep",
    Number(process.env.STREAK_SWEEP_INTERVAL_MS ?? 60_000),
  );
}
