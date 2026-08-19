import { bot } from "@/telegram/bot";
import { registerStartHandler } from "@/telegram/handlers/start";
import { registerTaskHandlers } from "@/telegram/handlers/tasks";
import { registerPhotoHandler } from "@/telegram/handlers/photo";
import { registerCallbackHandlers } from "@/telegram/handlers/callbacks";
import { registerResubmitHandler } from "./handlers/resubmit";
import { registerLimitsHandler } from "./handlers/limits";
import { registerSubmissionsHandlers } from "./handlers/submissions";
import { registerScoreHandler } from "./handlers/score";
import { registerHelpHandler } from "./handlers/help";

let started = false;

// Starts long-polling with auto-recovery. Used both by the standalone bot
// process (`bun run start:bot`) and the in-process mode (RUN_BOT_IN_PROCESS).
//
// grammY's bot.start() rejects on a fatal polling error — most importantly a
// 409 Conflict, which happens transiently whenever a second getUpdates hits the
// same token (a redeploy overlap, or a stray manual poll). In-process, an
// unhandled reject crashes the whole API. So we never let it bubble: on error
// we log and restart polling after a short backoff, so the bot self-heals and
// the API stays up regardless.
export function startTelegramBot() {
  if (started) return;
  started = true;

  registerStartHandler(bot);
  registerTaskHandlers(bot);
  registerPhotoHandler(bot);
  registerCallbackHandlers(bot);

  registerResubmitHandler(bot);
  registerLimitsHandler(bot);
  registerSubmissionsHandlers(bot);
  registerScoreHandler(bot);
  registerHelpHandler(bot);

  bot.catch((err) => {
    console.error("Telegram.Bot.handler.error: ", err);
  });

  const run = () => {
    bot
      .start({ drop_pending_updates: true })
      .then(() => console.log("Telegram bot polling stopped."))
      .catch((err) => {
        console.error(
          "Telegram bot polling error — restarting in 8s:",
          err?.message ?? err,
        );
        setTimeout(run, 8000);
      });
  };

  run();
  console.log("Telegram bot is running (long polling)");
}
