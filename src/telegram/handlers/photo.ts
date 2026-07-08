import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { resolveUserByTelegramId } from "@/services/identity";

export function registerPhotoHandler(bot: Bot<BotContext>) {
  bot.on("message:photo", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString();
    if (!telegramUserId) return;

    const user = await resolveUserByTelegramId(telegramUserId);

    if (!user) {
      await ctx.reply(
        "I don't recognize this Telegram account yet — link it from the web app first with /start <code>.",
      );
      return;
    }

    await ctx.reply("Send /tasks first and pick what this photo is proof of.");
  });
}
