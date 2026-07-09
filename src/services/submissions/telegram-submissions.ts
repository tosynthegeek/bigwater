import { createSubmission } from "@/services/submissions/submissions";
import { getTelegramPhotoFile } from "@/telegram/handlers/photo";

export async function createTelegramSubmission(
  fileId: string,
  userId: string,
  taskIdOrCustom: string,
) {
  const file = await getTelegramPhotoFile(fileId);
  return createSubmission(userId, taskIdOrCustom, file, "telegram");
}
