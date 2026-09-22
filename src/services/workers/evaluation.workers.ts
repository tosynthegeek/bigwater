import { Worker } from "bullmq";
import type { SubmissionEvaluationJobData } from "../queues/evaluation.queue";
import { evaluateSubmission } from "../ai/evaluate";
import { makeConnection } from "@/redis";
import { wireWorkerAlerts } from "@/utils/alerts";

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
  console.error(`Submission evaluation job ${job?.id} failed:`, err.message);
});

submissionEvaluationWorker.on("completed", (job) => {
  console.log("Submission evaluation job completed", job.id);
});

submissionEvaluationWorker.on("error", (err) => {
  console.error("Submission evaluation job worker error", err);
});

// Both the Sightengine and OpenRouter calls this worker makes can fail
// independently; if a submission repeatedly exhausts its retries here it
// means a member's proof is stuck and never reaches the admin queue.
wireWorkerAlerts(submissionEvaluationWorker, "worker:evaluation");
