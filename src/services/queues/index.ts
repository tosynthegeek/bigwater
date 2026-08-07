import { bankingSweepWorker, bankingWorker } from "../workers/banking.workers";
import { submissionEvaluationWorker } from "../workers/evaluation.workers";
import { streakSweepWorker } from "../workers/streak.workers";
import { notificationWorker } from "../workers/notification.worker";
import { scheduleBankingSweep } from "./banking.queue";
import { scheduleStreakSweep } from "./streak.queue";

export async function startQueues() {
  await scheduleBankingSweep();
  await scheduleStreakSweep();

  console.log("Starting queues...");
}

export async function stopQueues() {
  await Promise.all([
    bankingSweepWorker.close(),
    bankingWorker.close(),
    streakSweepWorker.close(),
    submissionEvaluationWorker.close(),
    notificationWorker.close(),
  ]);
}
