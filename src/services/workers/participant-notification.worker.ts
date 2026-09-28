import { Worker } from "bullmq";
import { makeConnection } from "@/redis";
import { bot } from "@/telegram/bot";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/services/logger/logger";
import type { ParticipantNotificationJobData } from "../queues/participant-notification.queue";

const log = logger.child({ source: "worker:participant-notification" });

export const participantNotificationWorker =
  new Worker<ParticipantNotificationJobData>(
    "participant-notification",
    async (job) => {
      const { telegramId, message } = job.data;
      await bot.api.sendMessage(telegramId, message);
    },
    { connection: makeConnection(), concurrency: 5 },
  );

participantNotificationWorker.on("failed", (job, err) => {
  log.error("notification failed", { jobId: job?.id, err });
});
participantNotificationWorker.on("completed", (job) => {
  log.info("notification sent", { jobId: job.id });
});
participantNotificationWorker.on("error", (err) => {
  log.error("worker-level error", { err });
});

wireWorkerAlerts(
  participantNotificationWorker,
  "worker:participant-notification",
);
