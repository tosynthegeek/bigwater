import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { getBands } from "@/services/economy/bands";

export function registerMultipliersHandler(bot: Bot<BotContext>) {
  bot.command("multipliers", async (ctx) => {
    const bands = await getBands();

    const comments: Record<string, string> = {
      Seedling: "Nah!! 🤨",
      Growing: "You can do better. 😊",
      Thriving: "Good effort!! 😃",
      Flourishing: "The Planet owes you. 🌏",
      Regenerative: "Voila! You’re a Superhero 👨‍🎤👩‍🎤",
    };

    let text =
      `🌪️ *Information for /multipliers*\n\n` +
      "```text\n" +
      "Band          Score       Multiplier\n" +
      "------------------------------------\n";

    for (const band of bands) {
      const multiplier = band.multiplier / 100;

      text +=
        `${band.name.padEnd(14)}` +
        `${`${band.minPoints}-${band.maxPoints}`.padEnd(12)}` +
        `${`${multiplier}x`.padEnd(13)}`;
    }

    text += "```\n\n";
    text += "Keep going and see how high you can climb! 🚀";

    await ctx.reply(text, { parse_mode: "Markdown" });
  });
}
