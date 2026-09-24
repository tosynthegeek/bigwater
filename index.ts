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
checkLocalStorageConfig();
await runSeeds();
await startQueues();

// With STORAGE_DRIVER=local, submission images are written to this service's
// disk and linked as `${PUBLIC_BASE_URL}/uploads/...`. If PUBLIC_BASE_URL
// points at a different Railway service (e.g. copied from staging), the AI
// evaluation worker 404s fetching every image and no submission ever reaches
// the admin queue. Without a volume, uploads are also wiped on every deploy.
function checkLocalStorageConfig() {
  if (Bun.env.STORAGE_DRIVER !== "local") return;

  const ownDomain = Bun.env.RAILWAY_PUBLIC_DOMAIN;
  if (!ownDomain) return; // not on Railway

  let baseHost = "";
  try {
    baseHost = new URL(Bun.env.PUBLIC_BASE_URL ?? "").host;
  } catch {}

  // A custom domain can legitimately differ from the Railway domain, so only
  // flag a mismatch when PUBLIC_BASE_URL is itself another Railway domain.
  if (
    !baseHost ||
    (baseHost.endsWith(".up.railway.app") && baseHost !== ownDomain)
  ) {
    void sendCriticalAlert({
      source: "config:storage",
      message: `PUBLIC_BASE_URL (${Bun.env.PUBLIC_BASE_URL ?? "unset"}) does not point at this service (${ownDomain}); submission images will not load`,
    });
  }

  if (!Bun.env.RAILWAY_VOLUME_MOUNT_PATH) {
    void sendCriticalAlert({
      source: "config:storage",
      message:
        "STORAGE_DRIVER=local but no Railway volume is mounted; uploaded images are lost on every deploy",
    });
  }
}

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
