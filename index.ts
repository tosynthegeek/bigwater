import app from "@/app";
import { runSeeds } from "@/db/seed";
import { privy } from "@/privy";
import { startQueues, stopQueues } from "@/services/queues";
import parseEnv from "@/zod/env";
import { sendCriticalAlert } from "@/utils/alerts";

// Last-resort net: anything that escapes every try/catch and every worker's
// own "failed"/"error" handler lands here. uncaughtException means the
// process is in an unknown state, so we alert then exit — Railway/PM2 will
// restart it. unhandledRejection is logged/alerted but not fatal by itself,
// matching Bun's default (non-crashing) behavior for it.
process.on("uncaughtException", (err) => {
  void sendCriticalAlert({
    source: "process:uncaughtException",
    message: "uncaught exception — process will exit",
    error: err,
  }).finally(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  void sendCriticalAlert({
    source: "process:unhandledRejection",
    message: "unhandled promise rejection",
    error: reason,
  });
});

parseEnv();
await runSeeds();
await startQueues();

async function warmupPrivy() {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const msg = String(args[0] ?? "");
    if (
      msg.includes("Failed to verify") ||
      msg.includes("InvalidAuthTokenError") ||
      msg.includes("JWT") ||
      msg.includes("jose")
    ) {
      return;
    }
    originalError(...args);
  };

  try {
    await privy
      .utils()
      .auth()
      .verifyAccessToken(
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3YXJtdXAifQ.invalid",
      );
  } catch {
  } finally {
    console.error = originalError;
  }

  await new Promise((r) => setTimeout(r, 300));
  console.log("[privy] JWKS warmup complete");
}

await warmupPrivy();

const port = Number(Bun.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  idleTimeout: 240,
  fetch: app.fetch,
});

console.log(`🚀 API running on port ${port}`);

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

if (Bun.env.ALERT_ON_REDEPLOY === "true") {
  const { sendRedeployAlert } = await import("@/utils/alerts");
  void sendRedeployAlert();
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
