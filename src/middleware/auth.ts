import { privy } from "@/privy";
import { createMiddleware } from "hono/factory";
import {
  getOrcreateAdminByPrivyDid,
  getOrCreateUserByPrivyDid,
} from "@/services/identity";
import { type User } from "@/db/schema/rail2";

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
  } catch (err: any) {
    const message = err?.message ?? "";
    const isTransientAuth =
      message.includes("Failed to verify") ||
      message.includes("JWKS") ||
      message.includes("JWT");

    if (isTransientAuth) {
      try {
        await new Promise((r) => setTimeout(r, 150));
        const claims = await privy.utils().auth().verifyAccessToken(token);
        const user = await getOrCreateUserByPrivyDid(claims.user_id);
        c.set("user", user);
        return next();
      } catch (retryErr: any) {
        console.error("[privyAuth] token verification failed (after retry)");
        console.error("  message:", retryErr?.message);
        c.set("user", null);
      }
    } else {
      console.error("[privyAuth] auth pipeline error:", message);
      c.set("user", null);
    }
  }

  return next();
});

export const adminLoginAuth = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    c.set("user", null);
    console.log("no token found");
    return next();
  }

  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    const user = await getOrcreateAdminByPrivyDid(claims.user_id);

    c.set("user", user);
  } catch (err: any) {
    const message = err?.message ?? "";
    const isTransientAuth =
      message.includes("Failed to verify") ||
      message.includes("JWKS") ||
      message.includes("JWT");

    if (isTransientAuth) {
      try {
        await new Promise((r) => setTimeout(r, 150));
        const claims = await privy.utils().auth().verifyAccessToken(token);
        const user = await getOrcreateAdminByPrivyDid(claims.user_id);
        c.set("user", user);
        return next();
      } catch (retryErr: any) {
        console.error("[privyAuth] token verification failed (after retry)");
        console.error("  message:", retryErr?.message);
        c.set("user", null);
      }
    } else {
      console.error("[privyAuth] auth pipeline error:", message);
      c.set("user", null);
    }
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
