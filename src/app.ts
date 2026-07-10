import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";

import { sql } from "drizzle-orm";
import { db } from "@/db";

import {
  privyAuth,
  requireAuth,
  requireAdmin,
  requireServiceAuth,
} from "@/middleware/auth";

import ApiRouter from "@/api/routes/public-routes";
import AdminRouter from "./api/routes/admin-router";
import InternalRouter from "./api/routes/internal-routes";

const app = new Hono();

app.use(logger());

app.use(
  "*",
  createMiddleware(async (c, next) => {
    c.res.headers.set("X-Robots-Tag", "noindex, nofollow");
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );

    await next();
  }),
);

app.use(
  "*",
  cors({
    origin:
      Bun.env.NODE_ENV === "production"
        ? [Bun.env.CLIENT_URL]
        : [
            Bun.env.CLIENT_URL,
            "http://localhost:3000",
            "http://localhost:3001",
          ],
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

app.use(
  "*",
  bodyLimit({
    maxSize: 10 * 1024 * 1024,
    onError: (c) => c.text("Payload too large", 413),
  }),
);

app.use("/api/*", privyAuth);
app.use("/api/*", requireAuth);

app.get("/api/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.text("OK");
  } catch {
    return c.text("Database unavailable", 500);
  }
});

app.use("/api/*", requireAuth);
app.use("/api/admin/*", requireAdmin);
app.use("/internal/*", requireServiceAuth);

app.route("/api/admin", AdminRouter);
app.route("/api", ApiRouter);
app.route("/internal", InternalRouter);

export default app;
