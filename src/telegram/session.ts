import { RedisAdapter } from "@grammyjs/storage-redis";
import redisClient from "@/redis";

export interface SessionData {
  pendingTaskId?: string;
}

export const sessionStorage = new RedisAdapter<SessionData>({
  instance: redisClient,
});
