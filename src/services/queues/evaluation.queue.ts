// queues/submission-evaluation.ts
import { Queue, Worker } from "bullmq";
import { evaluateSubmission } from "../ai/evaluate";
import { makeConnection } from "@/redis";

export const submissionEvaluationQueue = new Queue("submission-evaluation", {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export type SubmissionEvaluationJobData = {
  submissionId: string;
  imageUrl: string;
  taskDescription: string;
};

export const submissionEvaluationWorker =
  new Worker<SubmissionEvaluationJobData>(
    "submission-evaluation",
    async (job) => {
      const { submissionId, imageUrl, taskDescription } = job.data;
      await evaluateSubmission(submissionId, imageUrl, taskDescription);
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
