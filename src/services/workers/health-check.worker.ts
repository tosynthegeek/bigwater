import { Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { makeConnection } from "@/redis";
import redisClient from "@/redis";
import { sendCriticalAlert, wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";

import { bankingSweepQueue, bankingQueue } from "../queues/banking.queue";
import { submissionEvaluationQueue } from "../queues/evaluation.queue";
import { submissionNotificationQueue } from "../queues/notification.queue";
import { streakSweepQueue } from "../queues/streak.queue";
import { taskQueue } from "../queues/tasks.queue";
import { telegramMarketingQueue } from "../queues/telegram-marketing.queue";

const log = logger.child({ source: "worker:health-check" });

// Waiting-job-count a queue can sit at before we consider it "backed up"
// rather than just momentarily busy. The two sweep queues should basically
// never have more than a couple of jobs waiting (they run on a fixed
// interval and immediately fan out), so they get a much tighter threshold
// than the per-submission/per-user queues.
const DEFAULT_THRESHOLD = Number(process.env.QUEUE_BACKLOG_THRESHOLD ?? 200);
const SWEEP_THRESHOLD = Number(process.env.SWEEP_QUEUE_BACKLOG_THRESHOLD ?? 5);

const MONITORED_QUEUES = [
  { queue: bankingSweepQueue, threshold: SWEEP_THRESHOLD },
  { queue: bankingQueue, threshold: DEFAULT_THRESHOLD },
  { queue: submissionEvaluationQueue, threshold: DEFAULT_THRESHOLD },
  { queue: submissionNotificationQueue, threshold: DEFAULT_THRESHOLD },
  { queue: streakSweepQueue, threshold: SWEEP_THRESHOLD },
  { queue: taskQueue, threshold: DEFAULT_THRESHOLD },
  { queue: telegramMarketingQueue, threshold: DEFAULT_THRESHOLD },
];

async function checkQueueBacklogs() {
  for (const { queue, threshold } of MONITORED_QUEUES) {
    const [waiting, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getFailedCount(),
    ]);

    log.debug("queue depth", { queue: queue.name, waiting, failed });

    if (waiting > threshold) {
      await sendCriticalAlert({
        source: `health:queue-backlog:${queue.name}`,
        message: `${queue.name} has ${waiting} waiting jobs (threshold ${threshold})`,
        meta: { queue: queue.name, waiting, failed, threshold },
      });
    }
  }
}

async function checkRedis() {
  try {
    await redisClient.ping();
  } catch (err) {
    await sendCriticalAlert({
      source: "health:redis",
      message: "Redis unreachable",
      error: err,
    });
  }
}

async function checkDb() {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    await sendCriticalAlert({
      source: "health:db",
      message: "Database unreachable (periodic check)",
      error: err,
    });
  }
}

// Deliberately does NOT ping OpenRouter/Sightengine/Privy/S3 on a timer.
// Those are paid, rate-limited third-party APIs — a synthetic ping every
// couple of minutes burns quota for no real signal, since the evaluation
// worker already calls them on every submission and wireWorkerAlerts on
// submissionEvaluationWorker (see evaluation.workers.ts) fires the moment
// either one starts failing for real. If you want proactive checks for
// those specifically, S3 (HeadBucket) and Privy (unauthenticated JWKS
// fetch) are cheap enough to add here; OpenRouter/Sightengine are not.
export const healthCheckWorker = new Worker<Record<string, never>>(
  "health-check",
  async () => {
    const results = await Promise.allSettled([
      checkQueueBacklogs(),
      checkRedis(),
      checkDb(),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        log.error("health-check sub-check threw", { err: result.reason });
      }
    }
  },
  { connection: makeConnection(), concurrency: 1 },
);

healthCheckWorker.on("failed", (job, err) => {
  log.error("health-check job failed", { jobId: job?.id, err });
});
healthCheckWorker.on("error", (err) => {
  log.error("worker-level error", { err });
});

wireWorkerAlerts(healthCheckWorker, "worker:health-check");
