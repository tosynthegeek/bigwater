import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "@/telegram/bot";
// import { getActiveTasks } from "@/services/tasks"; // TODO: F3 — not built yet

export function registerTaskHandlers(bot: Bot<BotContext>) {
  bot.command("tasks", async (ctx) => {
    // const tasks = await getActiveTasks();
    const tasks: { id: string; title: string }[] = [];

    if (tasks.length === 0) {
      await ctx.reply(
        "No active tasks are configured yet — check back soon, or use /submit custom to log something anyway.",
      );
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const task of tasks) {
      keyboard.text(task.title, `task:${task.id}`).row();
    }
    keyboard.text("Custom submission", "task:custom");

    await ctx.reply("What did you do?", { reply_markup: keyboard });
  });
}
