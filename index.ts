import app from "@/app";
import parseEnv from "@/zod/env";

parseEnv();

const port = Number(Bun.env.PORT ?? 3000);

Bun.serve({
  port,
  idleTimeout: 240,
  fetch: app.fetch,
});

console.log(`🚀 API running on http://localhost:${port}`);
