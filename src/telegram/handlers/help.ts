// telegram/handlers/help.ts
import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";

export function registerHelpHandler(bot: Bot<BotContext>) {
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `*Here’s everything I can do:*\n\n` +
        `/tasks – today’s tasks and what you’ve got left\n` +
        `/limits – quick check on your daily limit\n` +
        `/score – your Score, streak and rank\n` +
        `/cancel – stop whatever we’re doing\n` +
        `/help – this menu\n\n` +
        `And if a submission gets rejected, the Resubmit button will be waiting right under it.\n\n`,
      { parse_mode: "Markdown" },
    );
  });
}
