import app from "@/app";
import { runSeeds } from "@/db/seed";
import { privy } from "@/privy";
import { startQueues, stopQueues } from "@/services/queues";
import parseEnv from "@/zod/env";

parseEnv();
await runSeeds();
await startQueues();

// Force Privy's JWKS fetch/cache to happen at boot rather than on the first
// real auth request — avoids the first few concurrent requests all racing to
// fetch keys and timing out.
try {
  await privy.utils().auth().verifyAccessToken("warmup");
} catch {
  // expected — the token is bogus, we only care about triggering the key fetch
}

const port = Number(Bun.env.PORT ?? 3000);

const server = Bun.serve({
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

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return; // ignore a second SIGTERM/SIGINT while draining
  shuttingDown = true;
  console.log(`\n${signal} received, draining...`);

  server.stop();

  try {
    await stopQueues();
    console.log("Queues drained cleanly");
  } catch (err) {
    console.error("Error draining queues:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
