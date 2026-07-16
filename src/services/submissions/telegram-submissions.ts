import { createSubmission } from "@/services/submissions/submissions";
import { getTelegramPhotoFile } from "@/telegram/handlers/photo";

export async function createTelegramSubmission(
  fileId: string,
  userId: string,
  taskId: string,
) {
  const file = await getTelegramPhotoFile(fileId);
  return createSubmission(userId, taskId, file, "telegram");
}
