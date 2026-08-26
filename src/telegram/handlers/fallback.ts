import type { Bot } from "grammy";

import type { BotContext } from "@/telegram/bot";

export function registerFallbackHandler(bot: Bot<BotContext>) {
  bot.on("message", async (ctx) => {
    await ctx.reply(
      "I don't understand that message.\n\n" +
        "Send /help to see the available commands, or /cancel to cancel any active conversation.",
    );
  });
}
