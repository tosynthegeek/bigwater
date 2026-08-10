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

import ApiRouter from "@/api/routes/api-routes";
import AdminRouter from "./api/routes/admin-routes";
import InternalRouter from "./api/routes/internal-routes";
import { adminLogin } from "./api/controllers/admin-controllers";

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

// CLIENT_URL may be a comma-separated list of allowed origins — the user app
// and the admin app deploy as two separate frontends, so both origins must be
// allowed to call the API with credentials.
const allowedOrigins = (Bun.env.CLIENT_URL ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin:
      Bun.env.NODE_ENV === "production"
        ? allowedOrigins
        : [...allowedOrigins, "http://localhost:3000", "http://localhost:3001"],
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

// Unauthenticated health check (used by Railway/uptime probes). Must be
// registered before the "/api/*" auth middleware so it is reachable without a
// bearer token — the previous "/api/health" sat after requireAuth and always
// returned 401.
app.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.text("OK");
  } catch {
    return c.text("Database unavailable", 500);
  }
});

// Public serving for the "local" storage driver (STORAGE_DRIVER=local): proof
// images are written to UPLOAD_DIR and served here so the admin queue can
// display them. Unauthenticated by design (an <img src> can't send a bearer
// token), and outside "/api" so it never hits requireAuth. No-op in the default
// "s3" driver (returns 404). The filename regex blocks path traversal.
app.get("/uploads/:filename", async (c) => {
  const filename = c.req.param("filename");
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return c.notFound();
  const uploadDir = Bun.env.UPLOAD_DIR ?? "./uploads";
  const file = Bun.file(`${uploadDir}/${filename}`);
  if (!(await file.exists())) return c.notFound();
  return new Response(file);
});

app.use("/api/admin/login", adminLogin);
app.use("/api/*", privyAuth);
app.use("/api/*", requireAuth);

app.use("/api/admin/*", privyAuth, requireAdmin);
app.use("/internal/*", requireServiceAuth);

app.route("/api/admin", AdminRouter);
app.route("/api", ApiRouter);
app.route("/internal", InternalRouter);

export default app;
