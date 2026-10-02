// telegram/handlers/help.ts
import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";

export function registerHelpHandler(bot: Bot<BotContext>) {
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `*Welcome!! Here’s the full menu of actions:*\n\n` +
        `/tasks – List of good actions for the day 📜\n` +
        `/limits – Quick check on your daily limit 🙅\n` +
        `/score – Your Score, Streak, Rank 🥇🥈🥉\n` +
        `/cancel – Stop! ⛔But would you?\n` +
        `/help – Full menu 📝\n\n` +
        `/multipliers – Applied to your score every month🌪️` +
        `And if a submission gets rejected, don’t feel dejected. Try again. You cannot give up. 🦾\n\n`,
      { parse_mode: "Markdown" },
    );
  });
}
