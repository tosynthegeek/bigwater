import { createSubmission } from "@/services/submissions/submissions";
import { getTelegramPhotoFile } from "@/telegram/handlers/photo";
import { submissionEvaluationQueue } from "../queues/evaluation.queue";
import { SubmissionRejectedError } from "@/utils/errors";

export async function createTelegramSubmission(
  fileId: string,
  userId: string,
  taskId: string,
) {
  const file = await getTelegramPhotoFile(fileId);

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

    return submission;
  } catch (error) {
    if (error instanceof SubmissionRejectedError) {
      throw new Error(`SUBMISSION_REJECTED:${error.message}`);
    }

    throw error;
  }
}
