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

    const status = await getSubmissionLimitStatus(user.id);
    const remaining = Math.max(
      0,
      status.today.submissionsLimit - status.today.submissionsUsed,
    );

    let text =
      `📊 Today: ${status.today.submissionsUsed}/${status.today.submissionsLimit} submissions used (${remaining} remaining)\n` +
      `High-value: ${status.today.highValueUsed}/${status.today.highValueLimit}`;

    if (status.cooldown.active) {
      const mins = Math.ceil(status.cooldown.remainingSeconds / 60);
      text += `\n⏳ Cooldown active — next submission available in ~${mins}m`;
    }

    await ctx.reply(text);
  });
}
