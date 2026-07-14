import { createMiddleware } from "hono/factory";
import redisClient from "@/redis";

interface RateLimiterOptions {
  windowSeconds: number;
  limit: number;
  keyPrefix: string;
}

function getClientIp(c: {
  req: { header: (name: string) => string | undefined };
}) {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function createRateLimiter({
  windowSeconds,
  limit,
  keyPrefix,
}: RateLimiterOptions) {
  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c);
    const key = `ratelimit:${keyPrefix}:${ip}:${c.req.path}`;

    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, windowSeconds);
    }

    if (count > limit) {
      return c.json(
        { error: "Too many requests. Please try again later." },
        429,
      );
    }

    return next();
  });
}

export const loginRateLimiter = createRateLimiter({
  windowSeconds: 60,
  limit: 10,
  keyPrefix: "login",
});
