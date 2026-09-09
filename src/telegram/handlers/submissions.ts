// telegram/handlers/submissions.ts
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "@/telegram/bot";
import { resolveUserByTelegramId } from "@/services/identity";
import { getUserSubmissionsWithStatus } from "@/services/submissions/submissions";

const STATUS_LABEL = {
  approved: "✅ Approved",
  rejected: "❌ Rejected",
  pending: "🕐 Pending",
  under_review: "⏳ Reviewing",
} as const;

export function registerSubmissionsHandlers(bot: Bot<BotContext>) {
  bot.callbackQuery("submissions:menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text("✅ Approved", "submissions:approved")
      .row()
      .text("❌ Rejected", "submissions:rejected")
      .row()
      .text("⏳ Under Review", "submissions:under_review")
      .row()
      .text("🕐 Pending", "submissions:pending");
    await ctx.reply("Your track record. Which pile do you want to see?", {
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(
    /^submissions:(approved|rejected|under_review|pending)$/,
    async (ctx) => {
      const status = ctx.match[1] as keyof typeof STATUS_LABEL;
      await ctx.answerCallbackQuery();

      const telegramUserId = ctx.from?.id.toString();
      if (!telegramUserId) return;
      const user = await resolveUserByTelegramId(telegramUserId);
      if (!user) {
        await ctx.reply("Link your account first with /start <code>.");
        return;
      }

      const subs = await getUserSubmissionsWithStatus(user.id, status);
      if (subs.length === 0) {
        await ctx.reply(
          "Nothing here yet. Finish a task, send the proof, and this list starts filling up. /tasks",
        );
        return;
      }

      const count = subs.length;

      const header =
        status === "approved"
          ? `✅ Approved · ${count}. On the record, permanently:`
          : status === "rejected"
            ? `❌ Rejected · ${count}. All of these can be redone:`
            : status === "under_review"
              ? `⏳ In review · ${count}. A reviewer has these, nothing needed from you:`
              : `🕐 Pending · ${count}. These are waiting to be reviewed:`;

      const text = subs
        .slice(0, 10)
        .map(
          (s) =>
            `${STATUS_LABEL[status]} ${s.taskTitle ?? "Unknown task"} — ${s.createdAt.toLocaleDateString()}`,
        )
        .join("\n");

      await ctx.reply(`${header}\n\n${text}`);
    },
  );
}
