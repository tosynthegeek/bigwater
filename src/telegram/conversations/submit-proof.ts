import { resolveUserByTelegramId } from "@/services/identity";
import { createTelegramSubmission } from "@/services/submissions/telegram-submissions";
import type { BotContext, BotConversation } from "@/telegram/bot";
import { SubmissionRejectedError } from "@/utils/errors";

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

  await ctx.reply("Send a photo as proof for that task.");

  const photoCtx = await conversation.waitFor("message:photo");
  const photo = photoCtx.message.photo.at(-1);

  if (!photo?.file_id) {
    await ctx.reply("I couldn't read the photo. Try sending it again.");
    return;
  }

  try {
    await conversation.external(() =>
      createTelegramSubmission(photo.file_id, user.id, taskId),
    );

    await ctx.reply(
      "Got your photo! Submission is queued for verification. You'll be notified once it's processed.",
    );
  } catch (error) {
    console.error("Error creating submission:", error);

    if (error instanceof SubmissionRejectedError) {
      await ctx.reply(error.message);
      return;
    }

    await ctx.reply(
      "There was an error processing your submission. Please try again later.",
    );
  }
}
