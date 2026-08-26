// telegram/handlers/help.ts
import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";

export function registerHelpHandler(bot: Bot<BotContext>) {
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `*BigWater commands*\n\n` +
        `/tasks – Available tasks + remaining daily uploads\n` +
        `/limits – Quick daily limit view\n` +
        `/score – Sustainability score, streaks & monthly tally\n` +
        `/cancel – Cancel any active conversation\n` +
        `/help – This message\n\n` +
        `After a rejection you’ll get a Resubmit button.`,
      { parse_mode: "Markdown" },
    );
  });
}
