import { createSubmission } from "@/services/submissions/submissions";
import { submissionEvaluationQueue } from "../queues/evaluation.queue";
import { SubmissionRejectedError } from "@/utils/errors";

export async function createTelegramSubmission(
  file: File,
  userId: string,
  taskId: string,
) {
  try {
    const { submission, task } = await createSubmission(
      userId,
      taskId,
      file,
      "telegram",
    );

    await submissionEvaluationQueue.add(
      "evaluate",
      {
        submissionId: submission.id,
        imageUrl: submission.imageUrl,
        taskTitle: task.title,
        taskDescription: task.description,
      },
      { jobId: submission.id },
    );

    return {
      ok: true as const,
      submission,
    };
  } catch (error) {
    if (error instanceof SubmissionRejectedError) {
      return {
        ok: false as const,
        message: error.message,
      };
    }

    throw error;
  }
}
