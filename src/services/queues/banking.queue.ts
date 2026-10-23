import { Queue, QueueEvents } from "bullmq";
import { makeConnection } from "@/redis";
import { scheduleRepeatable } from "../schedule";

export type SweepJobData = Record<string, never>;
export type BankJobData = { userId: string; month: string };

export const bankingSweepQueue = new Queue<SweepJobData>("banking-sweep", {
  connection: makeConnection(),
});
export const bankingQueue = new Queue<BankJobData>("banking", {
  connection: makeConnection(),
});
export const bankingQueueEvents = new QueueEvents("banking", {
  connection: makeConnection(),
});

export async function scheduleBankingSweep() {
  // Fixed jobId — re-adding just updates the schedule, doesn't duplicate it.
  // The sweep is idempotent (per-user bank jobs are deduped by jobId), so it
  // is safe to retry.
  await scheduleRepeatable(
    bankingSweepQueue,
    "sweep",
    "tally-sweep",
    Number(process.env.BANKING_SWEEP_INTERVAL_MS ?? 60_000),
  );
}
