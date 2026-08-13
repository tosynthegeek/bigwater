import type { Bot } from "grammy";
import { bot, type BotContext } from "@/telegram/bot";
import { resolveUserByTelegramId } from "@/services/identity";

export function registerPhotoHandler(bot: Bot<BotContext>) {
  bot.on("message:photo", async (ctx) => {
    const telegramUserId = ctx.from?.id.toString();
    if (!telegramUserId) return;

    const user = await resolveUserByTelegramId(telegramUserId);

    if (!user) {
      await ctx.reply(
        "I don't recognize this Telegram account yet — link it from the web app first with /start <code>.",
      );
      return;
    }

    await ctx.reply("Send /tasks first and pick what this photo is proof of.");
  });
}

export async function getTelegramPhotoFile(fileId: string): Promise<File> {
  const token = Bun.env.TELEGRAM_BOT_TOKEN;

  const tgFile = await bot.api.getFile(fileId);

  if (!tgFile.file_path) {
    throw new Error("Telegram file has no file path");
  }
  const filePath = tgFile.file_path;

  if (!filePath) {
    throw new Error("Telegram file has no file path");
  }

  const fileResponse = await fetch(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
  );

  if (!fileResponse.ok) {
    throw new Error("Failed to download Telegram image");
  }

  const contentType = fileResponse.headers.get("content-type") ?? "image/jpeg";
  const extension = contentType.split("/")[1] ?? "jpg";
  const buffer = await fileResponse.arrayBuffer();

  return new File([buffer], `photo.${extension}`, {
    type: contentType,
  });
}
