import { resolveUserByTelegramId } from "@/services/identity";
import type { BotContext, BotConversation } from "@/telegram/bot";
// import { createSubmission } from "@/services/submissions"; // TODO: F4 — not built yet


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
  const photo = photoCtx.message.photo.at(-1); // highest-res size

  // await conversation.external(() =>
  //   createSubmission({ userId: user.id, taskIdOrCustom, fileId: photo?.file_id })
  // );

  await ctx.reply(
    "Got your photo! Submission processing isn't wired up yet on this build — coming with F4.",
  );
}
