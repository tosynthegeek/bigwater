// telegram/handlers/tasks.ts
import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { getActiveTasks } from "@/services/tasks";
import { resolveUserByTelegramId } from "@/services/identity";
import { getSubmissionLimitStatus } from "@/services/submissions/submission-limits";

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
    await ctx.reply(
      header +
        "\nNo tasks available right now. Try again later or after the cooldown resets.",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const task of status.availableTasks) {
    keyboard.text(task.title, `task:${task.id}`).row();
  }

  await ctx.reply(header + "\nSelect a task:", {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export function registerTaskHandlers(bot: Bot<BotContext>) {
  bot.command("tasks", (ctx) => sendActiveTaskList(ctx));
}
