import { Queue } from "bullmq";
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
  taskTitle: string;
  taskDescription: string;
};
