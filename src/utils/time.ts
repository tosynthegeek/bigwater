import redisClient from "@/redis";

export const ONE_MINUTE = 60 * 1000;

export function startOfDayUtc(date: Date) {
  const copy = new Date(date);

  if (Bun.env.NODE_ENV === "development") {
    copy.setUTCMinutes(0, 0, 0);
    return copy;
  }

  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export async function checkRateLimit(key: string, max = 5, windowSec = 300) {
  const count = await redisClient.incr(key);
  if (count === 1) await redisClient.expire(key, windowSec);
  if (count > max) throw new Error("rate_limited");
}
