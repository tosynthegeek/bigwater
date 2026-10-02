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

const NAME_W = 13;
const SCORE_W = 10;
const MULT_W = 5;

export function registerMultipliersHandler(bot: Bot<BotContext>) {
  bot.command("multipliers", async (ctx) => {
    const bands = await getBands();

    let text =
      `🌪️ *Information for /multipliers*\n\n` +
      "```text\n" +
      `${"Band".padEnd(NAME_W)}${"Score".padEnd(SCORE_W)}${"Mult".padEnd(MULT_W)}\n` +
      `${"-".repeat(NAME_W + SCORE_W + MULT_W)}\n`;

    for (const band of bands) {
      const multiplier = band.multiplier / 100;
      const comment = COMMENTS[band.name];

      text +=
        `${band.name.padEnd(NAME_W)}` +
        `${`${band.minPoints}-${band.maxPoints}`.padEnd(SCORE_W)}` +
        `${`${multiplier}x`.padEnd(MULT_W)}\n`;

      if (comment) {
        text += `  ↳ ${comment}\n`;
      }
    }

    text += "```\n\n";
    text += "Keep going and see how high you can climb! 🚀";

    await ctx.reply(text, { parse_mode: "Markdown" });
  });
}
