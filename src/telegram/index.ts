// Standalone entrypoint for the Telegram bot (`bun run start:bot`).
// The actual startup + auto-recovery logic lives in ./run so it is shared with
// the in-process mode (RUN_BOT_IN_PROCESS) booted from the root index.ts.
import { startTelegramBot } from "@/telegram/run";

startTelegramBot();
