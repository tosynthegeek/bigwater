import { Worker } from "bullmq";
import { makeConnection } from "@/redis";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";
import { runDailyRollover } from "@/services/tasks";
import type { RolloverJobData } from "../queues/daily-rollover.queue";
import { telegramMarketingQueue } from "../queues/telegram-marketing.queue";

const log = logger.child({ source: "worker:daily-rollover" });

export const dailyRolloverWorker = new Worker<RolloverJobData>(
  "daily-rollover",
  async () => {
    // null = nothing to do: today already has a selection, nothing is
    // scheduled / templated, or an earlier tick already materialized it.
    const result = await runDailyRollover();
    if (!result) return;

    log.info("materialized today's selection", {
      source: result.source,
      count: result.tasks.length,
    });

    await telegramMarketingQueue.add("broadcast", {
      message: result.message,
      initiatedBy: "system",
    });
  },
  { connection: makeConnection(), concurrency: 1 },
);

dailyRolloverWorker.on("failed", (job, err) => {
  log.error("rollover failed", { jobId: job?.id, err });
});
dailyRolloverWorker.on("error", (err) => {
  log.error("worker-level error", { err });
});

wireWorkerAlerts(dailyRolloverWorker, "worker:daily-rollover");
