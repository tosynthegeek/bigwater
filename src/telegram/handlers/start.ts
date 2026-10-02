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
        `Welcome back, ${username} to $BIGW!👋\n\n` +
          `You've got ${remaining} submissions today. Act now and do your bit to Impact and Earn. Be the Sustainability Warrior that walks the talk. \n\n` +
          "Pick a task below or click /help for the full menu.",
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
      `Hey ${username}👋 Welcome to the world of BigWater!🌊\n\n` +
        "Here's how this works: type /tasks, pick your task, do it in real life, upload a pic. A real person supported by our AI engine checks it. Once your pic is approved, you get a Sustainability Score.\n\n" +
        "If rejected, try again. Do 5 tasks every day, every month and get a 3x multiplier on your score.\n" +
        "Be the Sustainability Warrior that Acts, Impacts, Earns $BIGW.",
    );
    await sendActiveTaskList(ctx);
  });
}
