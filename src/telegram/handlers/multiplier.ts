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

export function registerMultipliersHandler(bot: Bot<BotContext>) {
  bot.command("multipliers", async (ctx) => {
    const bands = await getBands();

    const blocks = bands.map((band) => {
      const multiplier = band.multiplier / 100;
      const comment = COMMENTS[band.name];

      return (
        `*${band.name}* · ${band.minPoints}–${band.maxPoints} · ${multiplier}x` +
        (comment ? `\n${comment}` : "")
      );
    });

    const text =
      `🌪️ *Information for /multipliers*\n\n` +
      blocks.join("\n\n") +
      "\n\nKeep going and see how high you can climb! 🚀";

    await ctx.reply(text, { parse_mode: "Markdown" });
  });
}
