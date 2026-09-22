// workers/notification.worker.ts
import { Worker } from "bullmq";
import { bot } from "@/telegram/bot";
import { getTaskById } from "@/services/tasks";
import { makeConnection } from "@/redis";
import { participantProfile } from "@/db/schema/rail2";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { InlineKeyboard } from "grammy";
import { wireWorkerAlerts } from "@/utils/alerts";

export const notificationWorker = new Worker(
  "submission-notification",
  async (job) => {
    const {
      userId,
      taskId,
      status,
      isFirstSubmission,
      isFirstApprovedSubmission,
    } = job.data;

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
    } else if (isFirstSubmission) {
      message =
        `❌ This one didn’t make it. Happens to the best of us.\n\n` +
        `Nine times out of ten it means the photo didn’t clearly show the task done. ` +
        `Your Score is untouched, and the task is still open.\n\n` +
        `Tap Resubmit and send a clearer shot.`;
    } else {
      message =
        `❌ Not this time either.\n\n` +
        `Quick tip: get the whole task in frame, in decent light. ` +
        `The reviewer can only approve what they can see.\n\n` +
        `Resubmit whenever you’re ready.`;
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

wireWorkerAlerts(notificationWorker, "worker:submission-notification");
