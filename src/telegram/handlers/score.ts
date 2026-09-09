// telegram/handlers/score.ts
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { resolveUserByTelegramId } from "@/services/identity";
import { getUserScoreSummary } from "@/services/score";

export function registerScoreHandler(bot: Bot<BotContext>) {
  bot.command("score", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString();
    if (!telegramUserId) return;

    const user = await resolveUserByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply("Link your account first with /start <code>.");
      return;
    }

    const summary = await getUserScoreSummary(user.id);
    if (!summary) {
      await ctx.reply("No score data yet — complete a task to get started.");
      return;
    }

    const multiplier = (summary.multiplier ?? 50) / 100;

    await ctx.reply(
      `🌱 *Sustainability Score*: ${summary.totalScore}\n` +
        `🔥 *Streak*: ${summary.currentStreak ?? 0} (best ${summary.longestStreak ?? 0})\n` +
        `📅 *This month*: ${summary.monthlyTally ?? 0} pts — ${summary.currentBand} (×${multiplier.toFixed(1)})\n` +
        `🏆 Rank: #${summary.globalRank ?? "—"}\n` +
        `\n Every point you’ve earned stays earned. The Score never drops.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text(
          "📋 My submissions",
          "submissions:menu",
        ),
      },
    );
  });
}
