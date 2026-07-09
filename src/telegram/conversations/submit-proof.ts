import { resolveUserByTelegramId } from "@/services/identity";
import { createTelegramSubmission } from "@/services/submissions/telegram-submissions";
import type { BotContext, BotConversation } from "@/telegram/bot";

export async function submitProofConversation(
  conversation: BotConversation,
  ctx: BotContext,
  taskIdOrCustom: string,
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

  await ctx.reply(
    taskIdOrCustom === "custom"
      ? "Send a photo of what you did — an admin will review it."
      : "Send a photo as proof for that task.",
  );

  const photoCtx = await conversation.waitFor("message:photo");
  const photo = photoCtx.message.photo.at(-1);

  if (!photo?.file_id) {
    await ctx.reply("I couldn't read the photo. Try sending it again.");
    return;
  }

  await conversation.external(() =>
    createTelegramSubmission(photo.file_id, user.id, taskIdOrCustom),
  );

  await ctx.reply(
    "Got your photo! Submission is queued for verification. You'll be notified once it's processed.",
  );
}
