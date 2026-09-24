import { Worker } from "bullmq";
import type { SubmissionEvaluationJobData } from "../queues/evaluation.queue";
import { evaluateSubmission } from "../ai/evaluate";
import { makeConnection } from "@/redis";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";
import { db } from "@/db";
import { submissions } from "@/db/schema/rail2";
import { and, eq } from "drizzle-orm";

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

  // Once every retry is spent, hand the submission to a human anyway. The
  // admin review queue only lists "under_review", so leaving it "pending"
  // would make the member's proof invisible to admins forever.
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  void releaseToManualReview(job.data.submissionId, err);
});

async function releaseToManualReview(submissionId: string, err: Error) {
  try {
    await db
      .update(submissions)
      .set({
        status: "under_review",
        aiConfidence: null,
        aiVerdict: `AI check failed, please review manually. (${err.message.slice(0, 300)})`,
      })
      .where(
        and(eq(submissions.id, submissionId), eq(submissions.status, "pending")),
      );
    log.warn("released to manual review after AI evaluation failed", {
      submissionId,
    });
  } catch (updateErr) {
    log.error("failed to release submission to manual review", {
      submissionId,
      err: updateErr,
    });
  }
}

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
