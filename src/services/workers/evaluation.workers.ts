import { Worker } from "bullmq";
import type { SubmissionEvaluationJobData } from "../queues/evaluation.queue";
import { evaluateSubmission } from "../ai/evaluate";
import { makeConnection } from "@/redis";

export const submissionEvaluationWorker =
  new Worker<SubmissionEvaluationJobData>(
    "submission-evaluation",
    async (job) => {
      const { submissionId, imageUrl, taskTitle, taskDescription } = job.data;
      await evaluateSubmission(submissionId, imageUrl, taskDescription, taskTitle);
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
