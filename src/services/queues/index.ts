import { bankingSweepWorker, bankingWorker } from "../workers/banking.workers";
import { submissionEvaluationWorker } from "../workers/evaluation.workers";
import { streakSweepWorker } from "../workers/streak.workers";
import { notificationWorker } from "../workers/notification.worker";
import { scheduleBankingSweep } from "./banking.queue";
import { scheduleStreakSweep } from "./streak.queue";
import { telegramMarketingWorker } from "../workers/telegram-marketing.worker";
import { taskNotificationWorker } from "../workers/tasks.workers";
import { healthCheckWorker } from "../workers/health-check.worker";
import { scheduleHealthCheck } from "./health-check.queue";
import { logger } from "@/utils/logger";

const log = logger.child({ source: "queues" });

export async function startQueues() {
  await scheduleBankingSweep();
  await scheduleStreakSweep();
  await scheduleHealthCheck();

  log.info("queues started");
}

export async function stopQueues() {
  await Promise.all([
    bankingSweepWorker.close(),
    bankingWorker.close(),
    streakSweepWorker.close(),
    submissionEvaluationWorker.close(),
    notificationWorker.close(),
    telegramMarketingWorker.close(),
    taskNotificationWorker.close(),
    healthCheckWorker.close(),
  ]);
}
