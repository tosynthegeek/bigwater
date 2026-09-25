import { Worker } from "bullmq";
import { bot } from "@/telegram/bot";
import { getTaskById } from "@/services/tasks";
import { makeConnection } from "@/redis";
import { participantProfile } from "@/db/schema/rail2";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { InlineKeyboard } from "grammy";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";

const log = logger.child({ source: "worker:submission-notification" });

export const notificationWorker = new Worker(
  "submission-notification",
  async (job) => {
    const {
      userId,
      taskId,
      status,
      verdict,
      isFirstSubmission,
      isFirstApprovedSubmission,
    } = job.data;

    const user = await db.query.participantProfile.findFirst({
      where: eq(participantProfile.userId, userId),
    });

    if (!user) {
      log.error("user not found for notification", { userId });
      return;
    }

    const feedback = verdict?.trim();

    const feedbackMessage = feedback
      ? `💡 Reviewer feedback:\n${feedback}\n\n`
      : "";

    if (!user?.telegramId) return;

    const task = await getTaskById(taskId);

    if (!task) {
      log.error("task not found for notification", { taskId });
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
        `${feedbackMessage}` +
        `Tap Resubmit and send a clearer shot.`;
    } else {
      message =
        `❌ Not this time either.\n\n` +
        `Quick tip: get the whole task in frame, in decent light. ` +
        `The reviewer can only approve what they can see.\n\n` +
        `${feedbackMessage}` +
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
  log.error("job failed", { jobId: job?.id, err });
});
notificationWorker.on("completed", (job) => {
  log.info("job completed", { jobId: job?.id });
});
notificationWorker.on("error", (err) => {
  log.error("worker-level error", { err });
});

wireWorkerAlerts(notificationWorker, "worker:submission-notification");
