import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { getBands } from "@/services/economy/bands";

const COMMENTS: Record<string, string> = {
  Seedling: "Nah!! 🤨",
  Growing: "You can do better. 😊",
  Thriving: "Good effort!! 😃",
  Flourishing: "The Planet owes you. 🌏",
  Regenerative: "Voila! You’re a Superhero 👨‍🎤👩‍🎤",
};

const NAME_W = 14;
const SCORE_W = 11;

export function registerMultipliersHandler(bot: Bot<BotContext>) {
  bot.command("multipliers", async (ctx) => {
    const bands = await getBands();

    const rows = bands.map((band) => {
      const multiplier = band.multiplier / 100;
      return (
        band.name.padEnd(NAME_W) +
        `${band.minPoints}-${band.maxPoints}`.padEnd(SCORE_W) +
        `${multiplier}x`
      );
    });

    const comments = bands
      .filter((band) => COMMENTS[band.name])
      .map((band) => `*${band.name}*: ${COMMENTS[band.name]}`);

    const text =
      `🌪️ *Information for /multipliers*\n\n` +
      "```text\n" +
      `${"Band".padEnd(NAME_W)}${"Score".padEnd(SCORE_W)}Mult\n` +
      `${"-".repeat(NAME_W + SCORE_W + 4)}\n` +
      rows.join("\n") +
      "\n```\n\n" +
      `*Month-end comments*\n` +
      comments.join("\n") +
      "\n\nKeep going and see how high you can climb! 🚀";

    await ctx.reply(text, { parse_mode: "Markdown" });
  });
}
