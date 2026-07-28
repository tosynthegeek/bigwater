import { Queue, QueueEvents } from "bullmq";
import { makeConnection } from "@/redis";

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
  await bankingSweepQueue.add(
    "sweep",
    {},
    {
      repeat: {
        every: Number(process.env.BANKING_SWEEP_INTERVAL_MS ?? 60_000),
      },
      jobId: "tally-sweep", // fixed id — re-adding just updates the schedule, doesn't duplicate it
    },
  );
}
