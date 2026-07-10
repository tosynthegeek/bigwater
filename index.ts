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
