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
    `*${task.title}*\n\n` +
      `${task.description}\n\n` +
      `Worth: ${task.basePoints}\n\n` +
      `*Done? Send one photo that clearly shows the work. The reviewer goes by what they can see, so get the whole thing in frame.*\n\n` +
      `Changed your mind? /cancel anytime, no hard feelings.`,
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
        "That’s your first proof in 🌊\n\n" +
          "It’s off to a real human for review, so give it a little time. We’ll ping you the moment there’s a verdict.\n\n" +
          `Meanwhile, you’ve still got ${remaining} submissions today. Send /tasks if you’re on a roll, or /help for the full menu.`,
      );
      return;
    }

    await ctx.reply(
      "Photo’s in 🌊 Off to review it goes.\n\n" +
        `We’ll message you the verdict. ${remaining} left today, send /tasks to keep the streak alive, or /help for the full menu.`,
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
