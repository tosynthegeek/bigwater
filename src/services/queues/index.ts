import {
  scheduleBankingSweep,
  bankingSweepWorker,
  bankingWorker,
} from "./banking.queue";
import { scheduleStreakSweep, streakSweepWorker } from "./streak.queue";

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
  ]);
}
