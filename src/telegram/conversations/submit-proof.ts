import { db } from "@/db";
import { tasks } from "@/db/schema/rail2";
import { resolveUserByTelegramId } from "@/services/identity";
import { createTelegramSubmission } from "@/services/submissions/telegram-submissions";
import { getTaskById } from "@/services/tasks";
import type { BotContext, BotConversation } from "@/telegram/bot";
import { eq } from "drizzle-orm";

export async function submitProofConversation(
  conversation: BotConversation,
  ctx: BotContext,
  taskId: string,
) {
  const telegramUserId = ctx.from?.id.toString();
  if (!telegramUserId) return;

  const user = await conversation.external(() =>
    resolveUserByTelegramId(telegramUserId),
  );

  if (!user) {
    await ctx.reply(
      "I don't recognize this Telegram account yet — link it from the web app first with /start <code>.",
    );
    return;
  }

  const task = await conversation.external(() => getTaskById(taskId));

  if (!task) {
    await ctx.reply(
      "That task could not be found. Please select another task.",
    );
    return;
  }

  await ctx.reply(
    `*${task.title}*\n\n` +
      `${task.description}\n\n` +
      `Base points: ${task.basePoints}\n\n` +
      `*Send a photo as proof for that task.*`,
    { parse_mode: "Markdown" },
  );

  const photoCtx = await conversation.waitFor("message:photo");
  const photo = photoCtx.message.photo.at(-1);

  if (!photo?.file_id) {
    await ctx.reply("I couldn't read the photo. Try sending it again.");
    return;
  }

  try {
    const result = await conversation.external(() =>
      createTelegramSubmission(photo.file_id, user.id, taskId),
    );

    if (!result.ok) {
      await ctx.reply(result.message);
      return;
    }

    await ctx.reply(
      "Got your photo! Submission is queued for verification. You'll be notified once it's processed.\n\n" +
        "Send /tasks to see what else you can submit today, or /help for all commands.",
    );
  } catch (error) {
    console.error("Error creating submission:", error);
    const message = error instanceof Error ? error.message : "";

    if (message.startsWith("SUBMISSION_REJECTED:")) {
      await ctx.reply(message.slice("SUBMISSION_REJECTED:".length));
      return;
    }

    await ctx.reply(
      "There was an error processing your submission. Please try again later.",
    );
  }
}
