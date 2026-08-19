import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { redeemTelegramLinkCode } from "@/services/identity";
import { sendActiveTaskList } from "./tasks";

export function registerStartHandler(bot: Bot<BotContext>) {
  bot.command("start", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString();
    if (!telegramUserId) return;

    // Not every Telegram account has a @username set. Requiring one used to make
    // /start silently do nothing for those users (a confusing dead end). Fall
    // back to the first name, then a stable tg_<id> handle, so linking always
    // proceeds — participant_profile.username is nullable/display-only anyway.
    const username =
      ctx.from?.username?.toString() ??
      ctx.from?.first_name?.toString() ??
      `tg_${telegramUserId}`;

    // grammY exposes the deep-link payload via ctx.match for a plain
    // bot.command("start", ...) handler.
    const code = typeof ctx.match === "string" ? ctx.match.trim() : "";

    if (!code) {
      await ctx.reply(
        "Welcome to BigWater! Link your account first from the web app — " +
          "it'll give you a button that opens this chat with everything set up.",
      );
      return;
    }

    const result = await redeemTelegramLinkCode(code, telegramUserId, username);

    if (!result.ok) {
      const message =
        result.reason === "telegram_already_linked"
          ? "This Telegram account is already linked to a BigWater profile."
          : "That link code is invalid or has expired — generate a new one from the web app.";
      await ctx.reply(message);
      return;
    }

    await ctx.reply(
      "You're linked! 🎉\n\n" +
        "Send /tasks to see what you can submit today, or /help for all commands.",
    );
    await sendActiveTaskList(ctx);
  });
}
