import { createSubmission } from "@/services/submissions/submissions";
import { getTelegramPhotoFile } from "@/telegram/handlers/photo";
import { submissionEvaluationQueue } from "../queues/evaluation.queue";

export async function createTelegramSubmission(
  fileId: string,
  userId: string,
  taskId: string,
) {
  const file = await getTelegramPhotoFile(fileId);
  let { submission, task } = await createSubmission(
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
}
