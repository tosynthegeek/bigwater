import { Queue } from "bullmq";
import { makeConnection } from "@/redis";

export const submissionNotificationQueue = new Queue(
  "submission-notification",
  {
    connection: makeConnection(),
  },
);
