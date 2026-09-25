import { Queue } from "bullmq";
import { makeConnection } from "@/redis";

export type ParticipantNotificationJobData = {
  telegramId: string;
  message: string;
};

export const participantNotificationQueue =
  new Queue<ParticipantNotificationJobData>("participant-notification", {
    connection: makeConnection(),
  });

export async function enqueueParticipantNotification(
  telegramId: string,
  message: string,
) {
  await participantNotificationQueue.add("notify", { telegramId, message });
}
