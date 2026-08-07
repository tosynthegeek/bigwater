import { Queue } from "bullmq";
import { makeConnection } from "@/redis";

export const telegramMarketingQueue = new Queue("telegram-marketing", {
  connection: makeConnection(),
});
