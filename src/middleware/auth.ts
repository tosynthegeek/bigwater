import { privy } from "@/privy";
import { createMiddleware } from "hono/factory";
import {
  getOrcreateAdminByPrivyDid,
  getOrCreateUserByPrivyDid,
  Rail1LinkError,
} from "@/services/identity";
import { authUsers, type User } from "@/db/schema/rail2";
import { eq } from "drizzle-orm";
import { verify } from "hono/jwt";
import redisClient from "@/redis";
import { db } from "@/db";
import { JWT_ALGORITHM } from "./rail1-jwt";

type Env = {
  Variables: {
    user: User | null;
  };
};

export const privyAuth = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  const rail1Token = c.req.header("x-rail1-token");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    c.set("user", null);
    console.log("no token found");
    return next();
  }

  let claims;

  try {
    claims = await privy.utils().auth().verifyAccessToken(token);
  } catch (err: any) {
    const message = err?.message ?? "";

    const isTransientAuth =
      message.includes("Failed to verify") ||
      message.includes("JWKS") ||
      message.includes("JWT");

    if (!isTransientAuth) {
      console.error("[privyAuth] token verification failed:", message);
      c.set("user", null);
      return next();
    }

    try {
      await new Promise((r) => setTimeout(r, 150));

      claims = await privy.utils().auth().verifyAccessToken(token);
    } catch (retryErr: any) {
      console.error(
        "[privyAuth] token verification failed after retry:",
        retryErr?.message,
      );

      c.set("user", null);
      return next();
    }
  }

  try {
    const user = await getOrCreateUserByPrivyDid(claims.user_id, rail1Token);
    // let user_id = "test-user-id";
    // const user = await getOrCreateUserByPrivyDid(user_id, rail1Token);

    c.set("user", user);
  } catch (err) {
    if (err instanceof Rail1LinkError) {
      return c.json(
        {
          error: "rail1_link_error",
          message: err.message,
        },
        401,
      );
    }

    console.error("[privyAuth] failed to resolve user:", err);
    return c.json(
      {
        error: "internal_server_error",
        message: "Failed to resolve authenticated user",
      },
      500,
    );
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

export const adminSessionAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return adminLoginAuth(c, next);
  }

  const cookie = c.req.header("cookie") ?? "";
  const token = cookie.match(/admin_session=([^;]+)/)?.[1];
  if (!token) {
    c.set("user", null);
    return next();
  }

  try {
    const payload = await verify(
      token,
      Bun.env.ADMIN_SESSION_SECRET,
      JWT_ALGORITHM,
    );
    const revoked = await redisClient.get(`revoked:${payload.jti}`);
    if (revoked) {
      c.set("user", null);
      return next();
    }

    const admin = await db.query.authUsers.findFirst({
      where: eq(authUsers.id, payload.sub as string),
    });

    if (!admin || admin.status !== "active") {
      c.set("user", null);
      return next();
    }

    c.set("user", admin);
  } catch {
    c.set("user", null);
  }

  return next();
});
