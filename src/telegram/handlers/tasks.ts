import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { getActiveTasks } from "@/services/tasks";

export function registerTaskHandlers(bot: Bot<BotContext>) {
  bot.command("tasks", async (ctx) => {
    const tasks = await getActiveTasks();

    if (tasks.length === 0) {
      await ctx.reply(
        "No active tasks are configured yet — check back soon, or use /tasks again later.",
      );
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const task of tasks) {
      keyboard.text(task.title, `task:${task.id}`).row();
    }

    await ctx.reply("What did you do?", { reply_markup: keyboard });
  });
}
