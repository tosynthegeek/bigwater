import { createSubmission } from "@/services/submissions/submissions";
import { getTelegramPhotoFile } from "@/telegram/handlers/photo";

export async function createTelegramSubmission(
  fileId: string,
  userId: string,
  taskId: string,
) {
  const file = await getTelegramPhotoFile(fileId);
  let sub = await createSubmission(userId, taskId, file, "telegram");
  return sub;
}
