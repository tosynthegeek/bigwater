import { makeConnection } from "@/redis";
import { runStreakBreakSweep } from "../economy/streaks";
import type { SweepJobData } from "../queues/banking.queue";
import { Worker } from "bullmq";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";

const log = logger.child({ source: "worker:streak-sweep" });

export const streakSweepWorker = new Worker<SweepJobData>(
  "streak-sweep",
  async () => {
    await runStreakBreakSweep();
  },
  { connection: makeConnection(), concurrency: 1 },
);

streakSweepWorker.on("failed", (job, err) => {
  log.error("sweep failed", { jobId: job?.id, err });
});
streakSweepWorker.on("completed", (job) => {
  log.info("sweep completed", { jobId: job?.id });
});
streakSweepWorker.on("error", (err) => {
  log.error("worker-level error", { err });
});

wireWorkerAlerts(streakSweepWorker, "worker:streak-sweep");
