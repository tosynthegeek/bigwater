// workers/notification.worker.ts
import { Worker } from "bullmq";
import { bot } from "@/telegram/bot";
import { getTaskById } from "@/services/tasks";
import { makeConnection } from "@/redis";
import { participantProfile } from "@/db/schema/rail2";
import { db } from "@/db";
import { eq } from "drizzle-orm";

export const notificationWorker = new Worker(
  "submission-notification",
  async (job) => {
    const { userId, taskId, status } = job.data;

    const user = await db.query.participantProfile.findFirst({
      where: eq(participantProfile.userId, userId),
    });

    if (!user) {
      console.error(`User ${userId} not found for notification`);
      return;
    }

    if (!user?.telegramId) return;

    const task = await getTaskById(taskId);

    const message =
      status === "approved"
        ? `✅ Your submission for "${task?.title ?? "your task"}" was approved!`
        : `❌ Your submission for "${task?.title ?? "your task"}" was rejected.`;

    await bot.api.sendMessage(user.telegramId, message);
  },
  { connection: makeConnection() },
);

notificationWorker.on("failed", (job, err) => {
  console.error(`submission-notification failed job=${job?.id}:`, err);
});
notificationWorker.on("completed", (job) => {
  console.log(`submission-notification completed job=${job?.id}`);
});
notificationWorker.on("error", (err) => {
  console.error("submission-notification worker error", err);
});
