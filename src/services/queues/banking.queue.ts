import { Queue, Worker, type Job } from "bullmq";
import { db } from "@/db";
import redisClient from "@/redis";
import { bankMonthlyScoreForUser } from "../economy/score";

type SweepJobData = Record<string, never>;
type BankJobData = { userId: string; month: string };

export const bankingSweepQueue = new Queue<SweepJobData>("banking-sweep", {
  connection: redisClient,
});
export const bankingQueue = new Queue<BankJobData>("banking", {
  connection: redisClient,
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

// Finds closed, unbanked tallies and fans them out as individual per-user jobs.
export const bankingSweepWorker = new Worker<SweepJobData>(
  "banking-sweep",
  async () => {
    const now = new Date();
    const closed = await db.query.monthlyTally.findMany({
      where: (t, { and, lte, eq }) =>
        and(lte(t.periodEnd, now), eq(t.isFinalized, false)),
    });

    await Promise.all(
      closed.map((t) =>
        bankingQueue.add(
          "bank",
          { userId: t.userId, month: t.month },
          { jobId: `bank:${t.userId}:${t.month}` }, // dedup if sweep overlaps a job still in flight
        ),
      ),
    );

    return { queued: closed.length };
  },
  { connection: redisClient, concurrency: 1 }, // one sweep at a time is enough — it's just an enumerate+enqueue
);

// Banks a single user's tally. Idempotent via the isFinalized claim inside
// bankMonthlyScoreForUser, so retries on failure are safe.
export const bankingWorker = new Worker<BankJobData>(
  "banking",
  async (job: Job<BankJobData>) => {
    await db.transaction((tx) =>
      bankMonthlyScoreForUser(tx, job.data.userId, job.data.month),
    );
  },
  {
    connection: redisClient,
    concurrency: Number(process.env.BANKING_WORKER_CONCURRENCY ?? 10),
  },
);

bankingSweepWorker.on("failed", (job, err) => {
  console.error(`banking-sweep failed job=${job?.id}:`, err);
});
bankingWorker.on("failed", (job, err) => {
  console.error(
    `banking failed user=${job?.data.userId} month=${job?.data.month}:`,
    err,
  );
});
