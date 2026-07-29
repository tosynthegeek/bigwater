import { Worker, type Job } from "bullmq";
import { db } from "@/db";
import { makeConnection } from "@/redis";
import { bankMonthlyScoreForUser } from "../economy/score";
import {
  bankingQueue,
  bankingQueueEvents,
  type BankJobData,
  type SweepJobData,
} from "../queues/banking.queue";

// Finds closed, unbanked tallies and fans them out as individual per-user jobs.
export const bankingSweepWorker = new Worker<SweepJobData>(
  "banking-sweep",
  async () => {
    const now = new Date();
    const closed = await db.query.monthlyTally.findMany({
      where: (t, { and, lte, eq }) =>
        and(lte(t.periodEnd, now), eq(t.isFinalized, false)),
    });
    console.log(`[banking-sweep] found ${closed.length} closed tallies`);

    await Promise.all(
      closed.map(async (t) => {
        console.log(
          `[banking-sweep] Queueing banking job for user=${t.userId} month=${t.month}`,
        );

        const job = await bankingQueue.add(
          "bank",
          { userId: t.userId, month: t.month },
          {
            jobId: `bank:${t.userId}:${t.month}`,
          },
        );

        console.log(
          `[banking-sweep] Added job id=${job.id} user=${t.userId} month=${t.month}`,
        );

        return job;
      }),
    );

    return { queued: closed.length };
  },
  { connection: makeConnection(), concurrency: 1 }, // one sweep at a time is enough — it's just an enumerate+enqueue
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
    connection: makeConnection(),
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

bankingQueueEvents.on("completed", ({ jobId }) => {
  console.log(`[banking] Job completed: ${jobId}`);
});

bankingWorker.on("ready", () => {
  console.log("[banking] worker ready");
});

bankingWorker.on("active", (job) => {
  console.log("[banking] active", job.id);
});

bankingWorker.on("completed", (job) => {
  console.log("[banking] completed", job.id);
});

bankingWorker.on("error", (err) => {
  console.error("[banking] worker error", err);
});
