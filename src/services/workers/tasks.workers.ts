// workers/notification.worker.ts
import { Worker } from "bullmq";
import { bot } from "@/telegram/bot";
import { makeConnection } from "@/redis";
import { participantProfile } from "@/db/schema/rail2";
import { db } from "@/db";
import { isNotNull } from "drizzle-orm";
import { wireWorkerAlerts } from "@/utils/alerts";

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

    console.log(
      `[task-notification] sending to ${users.length} Telegram users`,
    );

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
        console.error(
          `Failed to send message to user ${user.telegramId}:`,
          err,
        );
        failed++;
      }
    }
    console.log(`task-notification completed: ${sent} sent, ${failed} failed`);
  },
  { connection: makeConnection() },
);

taskNotificationWorker.on("failed", (job, err) => {
  console.error(`task-notification failed job=${job?.id}:`, err);
});
taskNotificationWorker.on("completed", (job) => {
  console.log(`task-notification completed job=${job?.id}`);
});
taskNotificationWorker.on("error", (err) => {
  console.error("task-notification worker error", err);
});

wireWorkerAlerts(taskNotificationWorker, "worker:task-notification");
