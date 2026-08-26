import type { Bot } from "grammy";

import type { BotContext } from "@/telegram/bot";

export function registerCancelHandler(bot: Bot<BotContext>) {
  bot.command("cancel", async (ctx) => {
    await ctx.conversation.exitAll();

    await ctx.reply(
      "Cancelled. Any active conversation has been stopped.\n\n" +
        "You can start again whenever you're ready.",
    );
  });
}
