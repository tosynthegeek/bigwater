import { bot } from "@/telegram/bot";
import { registerStartHandler } from "@/telegram/handlers/start";
import { registerTaskHandlers } from "@/telegram/handlers/tasks";
import { registerPhotoHandler } from "@/telegram/handlers/photo";
import { registerCallbackHandlers } from "@/telegram/handlers/callbacks";

registerStartHandler(bot);
registerTaskHandlers(bot);
registerPhotoHandler(bot);
registerCallbackHandlers(bot);

bot.catch((err) => {
  console.error("Telegram.Bot.error: ", err);
});

bot.start();

console.log("Telegram bot is running (long polling)");
