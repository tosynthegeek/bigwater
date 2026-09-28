import { Worker, type Job } from "bullmq";
import { db } from "@/db";
import { makeConnection } from "@/redis";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/services/logger/logger";
import { bankMonthlyScoreForUser } from "../economy/score";
import {
  bankingQueue,
  bankingQueueEvents,
  type BankJobData,
  type SweepJobData,
} from "../queues/banking.queue";

const sweepLog = logger.child({ source: "worker:banking-sweep" });
const bankLog = logger.child({ source: "worker:banking" });

// Finds closed, unbanked tallies and fans them out as individual per-user jobs.
export const bankingSweepWorker = new Worker<SweepJobData>(
  "banking-sweep",
  async () => {
    const now = new Date();
    const closed = await db.query.monthlyTally.findMany({
      where: (t, { and, lte, eq }) =>
        and(lte(t.periodEnd, now), eq(t.isFinalized, false)),
    });
    sweepLog.info("found closed tallies", { count: closed.length });

    await Promise.all(
      closed.map(async (t) => {
        const job = await bankingQueue.add(
          "bank",
          { userId: t.userId, month: t.month },
          {
            jobId: `bank:${t.userId}:${t.month}`,
          },
        );

        sweepLog.debug("queued banking job", {
          jobId: job.id,
          userId: t.userId,
          month: t.month,
        });

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
  sweepLog.error("sweep failed", { jobId: job?.id, err });
});
bankingWorker.on("failed", (job, err) => {
  bankLog.error("job failed", {
    jobId: job?.id,
    userId: job?.data.userId,
    month: job?.data.month,
    err,
  });
});

// Banking moves points from "pending" into a user's locked-in Sustainability
// Score — the one subsystem in rail2 that resembles a ledger. A stuck sweep
// (nothing gets queued) or a job that exhausts retries (a user's month never
// gets banked) are exactly the kind of silent failure email alerts are for.
wireWorkerAlerts(bankingSweepWorker, "worker:banking-sweep");
wireWorkerAlerts(bankingWorker, "worker:banking");

bankingQueueEvents.on("completed", ({ jobId }) => {
  bankLog.debug("job completed", { jobId });
});

bankingWorker.on("ready", () => {
  bankLog.info("worker ready");
});

bankingWorker.on("active", (job) => {
  bankLog.debug("job active", { jobId: job.id });
});

bankingWorker.on("completed", (job) => {
  bankLog.info("job completed", { jobId: job.id });
});

bankingWorker.on("error", (err) => {
  bankLog.error("worker-level error", { err });
});
