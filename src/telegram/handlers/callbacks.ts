import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";

export function registerCallbackHandlers(bot: Bot<BotContext>) {
  bot.callbackQuery(/^task:(.+)$/, async (ctx) => {
    const taskIdOrCustom = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("submitProof", taskIdOrCustom);
  });
}
