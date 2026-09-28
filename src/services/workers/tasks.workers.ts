// workers/notification.worker.ts
import { Worker } from "bullmq";
import { bot } from "@/telegram/bot";
import { makeConnection } from "@/redis";
import { participantProfile } from "@/db/schema/rail2";
import { db } from "@/db";
import { isNotNull } from "drizzle-orm";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";

const log = logger.child({ source: "worker:task-notification" });

export const taskNotificationWorker = new Worker(
  "task-notification",
  async (job) => {
    const { taskTitle, taskDescription } = job.data;

    // get all users with telegramId
    const users = await db
      .select({
        telegramId: participantProfile.telegramId,
      })
      .from(participantProfile)
      .where(isNotNull(participantProfile.telegramId));

    log.info("broadcasting task notification", { recipients: users.length });

    let sent = 0;
    let failed = 0;
    const message = `📢 New task available: "${taskTitle}"\n\n${taskDescription}\n\nSend /tasks to see what you can submit today, or /help for all commands.`;

    for (const user of users) {
      if (!user.telegramId) {
        continue;
      }

      try {
        await bot.api.sendMessage(user.telegramId, message);
        sent++;
      } catch (err) {
        log.error("failed to send to Telegram user", {
          telegramId: user.telegramId,
          err,
        });
        failed++;
      }
    }
    log.info("broadcast complete", { sent, failed });
  },
  { connection: makeConnection() },
);

taskNotificationWorker.on("failed", (job, err) => {
  log.error("job failed", { jobId: job?.id, err });
});
taskNotificationWorker.on("completed", (job) => {
  log.info("job completed", { jobId: job?.id });
});
taskNotificationWorker.on("error", (err) => {
  log.error("worker-level error", { err });
});

wireWorkerAlerts(taskNotificationWorker, "worker:task-notification");
