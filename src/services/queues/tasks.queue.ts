import { Queue } from "bullmq";
import { makeConnection } from "@/redis";

export const taskQueue = new Queue("task-notification", {
  connection: makeConnection(),
});
