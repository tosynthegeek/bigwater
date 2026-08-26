import { resolveUserByTelegramId } from "@/services/identity";
import { createTelegramSubmission } from "@/services/submissions/telegram-submissions";
import { getTaskById } from "@/services/tasks";
import type { BotContext, BotConversation } from "@/telegram/bot";
import { getTelegramPhotoFile } from "../handlers/photo";
import { detectAndValidateImage } from "@/lib/file-validation";

export async function submitProofConversation(
  conversation: BotConversation,
  ctx: BotContext,
  taskId: string,
) {
  const telegramUserId = ctx.from?.id.toString();
  if (!telegramUserId) return;

  const user = await conversation.external(() =>
    resolveUserByTelegramId(telegramUserId),
  );

  if (!user) {
    await ctx.reply(
      "I don't recognize this Telegram account yet — link it from the web app first with /start <code>.",
    );
    return;
  }

  const task = await conversation.external(() => getTaskById(taskId));

  if (!task) {
    await ctx.reply(
      "That task could not be found. Please select another task " +
        "or send /cancel to stop." +
        "Send /help if you need help.",
    );
    return;
  }

  await ctx.reply(
    `*${task.title}*\n\n` +
      `${task.description}\n\n` +
      `Base points: ${task.basePoints}\n\n` +
      `*Send a photo as proof for that task.*\n\n` +
      `Send /cancel at any time to stop.`,
    { parse_mode: "Markdown" },
  );

  const photoCtx = await conversation.wait();

  if (photoCtx.message?.text?.trim().toLowerCase() === "/cancel") {
    await ctx.reply("Submission cancelled. You can start again with /tasks.");
    return;
  }

  const photo = photoCtx.message?.photo?.at(-1);

  if (!photo?.file_id) {
    await ctx.reply(
      "I don't understand that message.\n\n" +
        "Please send a JPEG or PNG photo as proof, " +
        "or send /cancel to stop.\n\n" +
        "Send /help if you need help.",
    );
    return;
  }

  try {
    const file = await getTelegramPhotoFile(photo?.file_id);

    const validation = await detectAndValidateImage(file);

    if (!validation.ok) {
      await ctx.reply(
        `${validation.reason}\n\n` +
          `Send a JPEG or PNG image (max 1MB) to submit as proof, or send /cancel to cancel this submission.`,
      );
      return;
    }

    const result = await conversation.external(() =>
      createTelegramSubmission(file, user.id, taskId),
    );

    if (!result.ok) {
      await ctx.reply(result.message);
      return;
    }

    await ctx.reply(
      "Got your photo! Submission is queued for verification. You'll be notified once it's processed.\n\n" +
        "Send /tasks to see what else you can submit today, or /help for all commands.",
    );
  } catch (error) {
    console.error("Error creating submission:", error);
    const message = error instanceof Error ? error.message : "";

    if (message.startsWith("SUBMISSION_REJECTED:")) {
      await ctx.reply(message.slice("SUBMISSION_REJECTED:".length));
      return;
    }

    await ctx.reply(
      "There was an error processing your submission. Please try again later.",
    );
  }
}
