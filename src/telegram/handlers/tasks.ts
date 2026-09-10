// telegram/handlers/tasks.ts
import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { getActiveTasks } from "@/services/tasks";
import { resolveUserByTelegramId } from "@/services/identity";
import { getSubmissionLimitStatus } from "@/services/submissions/submission-limits";
import { getUserStreak } from "@/services/economy/streaks";

export async function sendActiveTaskList(ctx: BotContext) {
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

  let header = `📊 Today: ${status.today.submissionsUsed}/${status.today.submissionsLimit} used · *${remaining} left*\n`;

  if (status.cooldown.active) {
    const mins = Math.ceil(status.cooldown.remainingSeconds / 60);
    header += `⏳ Cooldown — next submission in ~${mins}m\n`;
  }

  if (status.availableTasks.length === 0) {
    const streak = await getUserStreak(user.id);
    let message: string;
    if (streak >= 3) {
      message =
        `${header}\n` +
        `Full house, again. Day ${streak} and counting.\n` +
        `Rest up, tomorrow’s tasks will be waiting.`;
    } else {
      message =
        `${header}\n` +
        `That’s a wrap for today. Everything’s in for review, and your limit resets in 24 hours.\n` +
        `See you tomorrow. Your streak will thank you 🔥`;
    }
    await ctx.reply(message, { parse_mode: "Markdown" });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const task of status.availableTasks) {
    keyboard.text(task.title, `task:${task.id}`).row();
  }

  const prompt =
    remaining === 1
      ? "Last one of the day. Make it count:"
      : `What good are we doing today? Pick one:`;

  await ctx.reply(header + `\n${prompt}`, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export function registerTaskHandlers(bot: Bot<BotContext>) {
  bot.command("tasks", (ctx) => sendActiveTaskList(ctx));
}
