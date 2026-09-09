import type { Bot } from "grammy";

import type { BotContext } from "@/telegram/bot";

export function registerFallbackHandler(bot: Bot<BotContext>) {
  bot.on("message", async (ctx) => {
    await ctx.reply(
      "I didn’t catch that. I’m a simple bot, I only speak commands and photos.\n" +
        "/help shows everything I understand. Mid-task and want out? /cancel does it.",
    );
  });
}
