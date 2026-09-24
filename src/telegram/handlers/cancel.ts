import type { Bot } from "grammy";

import type { BotContext } from "@/telegram/bot";

export function registerCancelHandler(bot: Bot<BotContext>) {
  bot.command("cancel", async (ctx) => {
    await ctx.conversation.exitAll();

    await ctx.reply(
      "Cancelled, clean slate. Nothing was submitted.\n\n" +
        "/tasks whenever you're ready.",
    );
  });
}
