import { Queue } from "bullmq";
import { makeConnection } from "@/redis";

export type HealthCheckJobData = Record<string, never>;

export const healthCheckQueue = new Queue<HealthCheckJobData>("health-check", {
  connection: makeConnection(),
});

export async function scheduleHealthCheck() {
  await healthCheckQueue.add(
    "check",
    {},
    {
      repeat: {
        every: Number(process.env.HEALTH_CHECK_INTERVAL_MS ?? 120_000),
      },
      jobId: "health-check", // fixed id, same re-add-updates-schedule pattern as banking/streak sweeps
    },
  );
}
