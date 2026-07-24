import IORedis from "ioredis";

const redisClient = new IORedis(Bun.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export default redisClient;

export function makeConnection() {
  return new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
}
