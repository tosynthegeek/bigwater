import { privy } from "@/privy";
import { createMiddleware } from "hono/factory";
import { getOrCreateUserByPrivyDid } from "@/services/identity";
import type { users } from "@/db/schema/bigwater";

type User = typeof users.$inferSelect;

type Env = {
  Variables: {
    user: User | null;
  };
};

export const privyAuth = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    c.set("user", null);
    console.log("no token found");
    return next();
  }

  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    const user = await getOrCreateUserByPrivyDid(claims.user_id);
    // let user_id = "test-user-id";
    // const user = await getOrCreateUserByPrivyDid(user_id);

    c.set("user", user);
  } catch {
    c.set("user", null);
  }

  return next();
});

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  if (!c.get("user")) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return next();
});

export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user");
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return c.json({ error: "Admin access required" }, 403);
  }
  return next();
});

export const requireServiceAuth = createMiddleware(async (c, next) => {
  const token = c.req.header("x-api-key");

  if (!token || token !== Bun.env.AI_SERVICE_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

export const requireBotSecret = createMiddleware(async (c, next) => {
  const secret = c.req.header("x-bot-secret");
  if (!secret || secret !== Bun.env.TELEGRAM_BOT_SHARED_SECRET) {
    return c.json({ error: "Invalid bot secret" }, 401);
  }
  return next();
});
