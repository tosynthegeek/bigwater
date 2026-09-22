import { Worker } from "bullmq";
import type { SubmissionEvaluationJobData } from "../queues/evaluation.queue";
import { evaluateSubmission } from "../ai/evaluate";
import { makeConnection } from "@/redis";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";

const log = logger.child({ source: "worker:evaluation" });

export const submissionEvaluationWorker =
  new Worker<SubmissionEvaluationJobData>(
    "submission-evaluation",
    async (job) => {
      const { submissionId, imageUrl, taskTitle, taskDescription } = job.data;
      await evaluateSubmission(
        submissionId,
        imageUrl,
        taskDescription,
        taskTitle,
      );
    },
    {
      connection: makeConnection(),
      concurrency: 5,
    },
  );

submissionEvaluationWorker.on("failed", (job, err) => {
  log.error("job failed", { jobId: job?.id, err });
});

submissionEvaluationWorker.on("completed", (job) => {
  log.info("job completed", { jobId: job.id });
});

submissionEvaluationWorker.on("error", (err) => {
  log.error("worker-level error", { err });
});

// Both the Sightengine and OpenRouter calls this worker makes can fail
// independently; if a submission repeatedly exhausts its retries here it
// means a member's proof is stuck and never reaches the admin queue.
wireWorkerAlerts(submissionEvaluationWorker, "worker:evaluation");
