import app from "@/app";
import { runSeeds } from "@/db/seed";
import parseEnv from "@/zod/env";

parseEnv();
await runSeeds();

const port = Number(Bun.env.PORT ?? 3000);

Bun.serve({
  port,
  idleTimeout: 240,
  fetch: app.fetch,
});

console.log(`🚀 API running on http://localhost:${port}`);

// Single-service deployments (e.g. staging on one Railway service) can run the
// Telegram bot in the same process as the API by setting RUN_BOT_IN_PROCESS=true.
// Importing the module registers the handlers and starts long-polling in the
// background (bot.start() is not awaited there), so this does not block serving.
// Production can instead run the bot as its own process via `bun run start:bot`.
if (Bun.env.RUN_BOT_IN_PROCESS === "true") {
  const { startTelegramBot } = await import("@/telegram/run");
  startTelegramBot();
  console.log("🤖 Telegram bot started in-process (long polling)");
}
