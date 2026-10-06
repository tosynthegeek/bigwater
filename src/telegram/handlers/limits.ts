// telegram/handlers/limits.ts
import type { Bot } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { resolveUserByTelegramId } from "@/services/identity";
import { getSubmissionLimitStatus } from "@/services/submissions/submission-limits";

export function registerLimitsHandler(bot: Bot<BotContext>) {
  bot.command("limits", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString();
    if (!telegramUserId) return;

    const user = await resolveUserByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply("Link your account first with /start <code>.");
      return;
    }

    if (user.isFlagged) {
      await ctx.reply(
        "Your account is currently flagged from submitting tasks. Please contact support if you believe this is a mistake.",
      );
      return;
    }

    const status = await getSubmissionLimitStatus(user.id);
    const remaining = Math.max(
      0,
      status.today.submissionsLimit - status.today.submissionsUsed,
    );

    if (remaining === 0) {
      const text =
        `📊 Today: ${status.today.submissionsUsed}/${status.today.submissionsLimit} submitted *${remaining} left*\n\n` +
        `🏆 High Value – ${status.today.highValueUsed}/${status.today.highValueLimit}\n\n` +
        `You’re such a champion ❤️\n\n` +
        `See you tomorrow 👋`;

      await ctx.reply(text, { parse_mode: "Markdown" });
      return;
    }

    let text =
      `📊 Today: ${status.today.submissionsUsed}/${status.today.submissionsLimit} submissions used (${remaining} remaining)\n` +
      `🏆 High Value: ${status.today.highValueUsed}/${status.today.highValueLimit}`;

    if (status.cooldown.active) {
      const mins = Math.ceil(status.cooldown.remainingSeconds / 60);
      text += `\n⏳ Cooldown active — next submission available in ~${mins}m`;
    }

    text += `\n\nWhat’s next? Pick one - /tasks`;

    await ctx.reply(text);
  });
}
