import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";
import {
  redeemTelegramLinkCode,
  resolveUserByTelegramId,
} from "@/services/identity";
import { sendActiveTaskList } from "./tasks";
import { getSubmissionLimitStatus } from "@/services/submissions/submission-limits";

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

    const existingUser = await resolveUserByTelegramId(telegramUserId);

    if (existingUser) {
      if (code) {
        await ctx.reply(
          `👋 This Telegram account is already connected to BigWater.\n\n` +
            `There's nothing else you need to link. Your existing account is safe and ready to go.\n\n` +
            `Use /tasks to find your next task, /score to check your Sustainability Score, or /help to see everything I can do.`,
        );

        return;
      }
      const status = await getSubmissionLimitStatus(existingUser.id);
      const remaining = Math.max(
        0,
        status.today.submissionsLimit - status.today.submissionsUsed,
      );

      await ctx.reply(
        `Welcome back, ${username}! 👋\n\n` +
          `You've got ${remaining} submissions left today, and every approved one grows your score for good.\n\n` +
          "Pick a task below, or /help for the full menu.",
      );

      await sendActiveTaskList(ctx);
      return;
    }

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
      `Hey ${username}👋 Welcome to BigWater\n\n` +
        "Here's how this works: pick a task, do it in real life, send one photo as proof. A real person checks it, and your Sustainability Score goes up. It never comes back down.\n\n" +
        "Send /tasks to see what you can submit today, or /help for the full menu.",
    );
    await sendActiveTaskList(ctx);
  });
}
