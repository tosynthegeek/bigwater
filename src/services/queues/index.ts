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
import { morningNotificationWorker } from "../workers/morning-notification.worker";
import { scheduleMorningNotification } from "./morning-notification.queue";
import { logger } from "@/utils/logger";
import { participantNotificationWorker } from "../workers/participant-notification.worker";
import { dailyRolloverWorker } from "../workers/daily-rollover.worker";
import { scheduleDailyRollover } from "./daily-rollover.queue";

const log = logger.child({ source: "queues" });

export async function startQueues() {
  await scheduleBankingSweep();
  await scheduleStreakSweep();
  await scheduleDailyRollover();
  await scheduleHealthCheck();
  await scheduleMorningNotification();

  log.info("queues started");
}

export async function stopQueues() {
  await Promise.all([
    bankingSweepWorker.close(),
    bankingWorker.close(),
    streakSweepWorker.close(),
    dailyRolloverWorker.close(),
    submissionEvaluationWorker.close(),
    notificationWorker.close(),
    telegramMarketingWorker.close(),
    taskNotificationWorker.close(),
    healthCheckWorker.close(),
    morningNotificationWorker.close(),
    participantNotificationWorker.close(),
  ]);
}
