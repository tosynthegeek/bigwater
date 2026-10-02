import { resolveUserByTelegramId } from "@/services/identity";
import { createTelegramSubmission } from "@/services/submissions/telegram-submissions";
import { getTaskById } from "@/services/tasks";
import type { BotContext, BotConversation } from "@/telegram/bot";
import { getTelegramPhotoFile } from "../handlers/photo";
import { detectAndValidateImage } from "@/lib/file-validation";
import { isUserFirstSubmission } from "@/services/submissions/submissions";
import { getSubmissionLimitStatus } from "@/services/submissions/submission-limits";

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
    `🌍 *${task.title}*\n\n` +
      `${task.description}\n\n` +
      `Worth: ${task.basePoints} points \n\n` +
      `*Done? Send a clear pic now. Good work must be rewarded🎁.*\n\n` +
      `Wanna do later? /cancel anytime. No hard feelings 🤗`,
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
      "Sorry!! That file won’t work. Pic needs to be JPEG or PNG only. Try sending again.\n\n" +
        "Send /help for the full menu.",
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

    const isFirstSubmission = await conversation.external(() =>
      result.submission
        ? isUserFirstSubmission(user.id, result.submission.id)
        : false,
    );

    const status = await getSubmissionLimitStatus(user.id);
    const remaining = Math.max(
      0,
      status.today.submissionsLimit - status.today.submissionsUsed,
    );

    if (isFirstSubmission) {
      await ctx.reply(
        "That’s your first good deed of the day🌊\n\n" +
          "Now over to our manned AI engine for review. Standby for the verdict.\n\n" +
          `Meanwhile, you still have ${remaining} submissions today. Send /tasks or /help for the full menu. Keep the streak going.`,
      );
      return;
    }

    await ctx.reply(
      "Submitted!!! 📮\n" +
        "Now under review.\n\n" +
        "Standby for the verdict.👨‍🎓\n" +
        `${remaining} left today. Send /tasks to keep the momentum going or /help for the full menu`,
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
