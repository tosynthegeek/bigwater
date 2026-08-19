import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";

export function registerResubmitHandler(bot: Bot<BotContext>) {
  bot.callbackQuery(/^resubmit:(.+)$/, async (ctx) => {
    const taskId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("submitProof", taskId);
  });
}
