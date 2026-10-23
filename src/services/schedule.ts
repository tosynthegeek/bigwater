import type { JobsOptions, Queue } from "bullmq";

// Retry transient failures (e.g. a dropped DB connection) a couple of times
// before the job is considered failed and an alert is emailed.
export const SWEEP_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
} satisfies JobsOptions;

/**
 * Registers a repeating job, replacing any existing schedule with the same
 * name + jobId first.
 *
 * Why the replace: BullMQ copies a repeatable job's options forward from one
 * run to the next, so re-calling queue.add() with new options (like
 * `attempts`) is a no-op for a schedule that already exists in Redis. Removing
 * the old one first makes the new options take effect on deploy. The
 * schedule key is derived from name/jobId/repeat options, so concurrent
 * instances doing this at startup converge on the same single schedule.
 */
export async function scheduleRepeatable<T>(
  queue: Queue<T>,
  name: string,
  jobId: string,
  every: number,
  opts: JobsOptions = SWEEP_JOB_OPTIONS,
) {
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === name && job.id === jobId) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  await (queue as Queue<any>).add(
    name,
    {},
    { ...opts, repeat: { every }, jobId },
  );
}
