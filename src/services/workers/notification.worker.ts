// workers/notification.worker.ts
import { Worker } from "bullmq";
import { bot } from "@/telegram/bot";
import { getTaskById } from "@/services/tasks";
import { makeConnection } from "@/redis";
import { participantProfile } from "@/db/schema/rail2";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { InlineKeyboard } from "grammy";

export const notificationWorker = new Worker(
  "submission-notification",
  async (job) => {
    const { userId, taskId, status, isFirstApprovedSubmission } = job.data;

    const user = await db.query.participantProfile.findFirst({
      where: eq(participantProfile.userId, userId),
    });

    if (!user) {
      console.error(`User ${userId} not found for notification`);
      return;
    }

    if (!user?.telegramId) return;

    const task = await getTaskById(taskId);

    if (!task) {
      console.error(`Task ${taskId} not found for notification`);
      return;
    }

    let points = task.basePoints;
    let message: string;

    if (status === "approved") {
      if (isFirstApprovedSubmission) {
        message =
          `✅ Your first approval. Welcome to the record.\n\n` +
          `+${points} points on your Sustainability Score, and here's the best part: it never drops.\n\n` +
          `/score to see it. /tasks for the next one.`;
      } else {
        message =
          `✅ Approved: ${task.title}\n\n` +
          `+${points} points, locked in for good.\n\n` +
          `/tasks for your next one, or /score to admire the numbers.`;
      }
    } else {
      message = `❌ Your submission for ${task.title} was rejected.`;
    }

    const replyMarkup =
      status === "rejected"
        ? new InlineKeyboard().text("🔄 Resubmit", `resubmit:${taskId}`)
        : undefined;

    await bot.api.sendMessage(user.telegramId, message, {
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
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
