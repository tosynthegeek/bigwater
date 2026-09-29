import { Context } from "hono";
import { db } from "@/db";
import { authUsers } from "@/db/schema/rail2";
import { eq, or } from "drizzle-orm";
import { nanoid } from "@/utils/nanoid";
import { getOrcreateAdminByPrivyDid } from "@/services/identity";
import { privy } from "@/privy";
import { checkRateLimit } from "@/utils/time";
import { sign, verify } from "hono/jwt";
import { JWT_ALGORITHM } from "@/middleware/rail1-jwt";
import redisClient from "@/redis";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SECRET = Bun.env.ADMIN_SESSION_SECRET;

export async function handlePrivyLogin(c: Context, token: string) {
  let admin;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    admin = await getOrcreateAdminByPrivyDid(claims.user_id);
  } catch (err) {
    console.error("[adminLogin:privy]", (err as Error)?.message);
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!admin || (admin.role !== "admin" && admin.role !== "superadmin")) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  return issueAdminSession(c, admin);
}

export async function handlePasswordLogin(
  c: Context,
  identifier: string,
  password: string,
) {
  try {
    await checkRateLimit(`admin-login:${identifier}`);
  } catch {
    return c.json({ error: "Too many attempts, try again later" }, 429);
  }

  const admin = await db.query.authUsers.findFirst({
    where: or(
      eq(authUsers.email, identifier),
      eq(authUsers.username, identifier),
    ),
  });

  if (!admin) {
    return c.json({ error: "No account found for this identifier" }, 401);
  }
  if (!admin.passwordHash) {
    return c.json(
      { error: "Password login is not enabled for this account" },
      401,
    );
  }
  if (admin.status !== "active") {
    return c.json({ error: "This account is inactive" }, 401);
  }
  if (admin.role !== "admin" && admin.role !== "superadmin") {
    return c.json({ error: "This account does not have admin access" }, 401);
  }
  if (!(await Bun.password.verify(password, admin.passwordHash))) {
    return c.json({ error: "Incorrect password" }, 401);
  }

  return issueAdminSession(c, admin);
}

export async function issueAdminSession(
  c: Context,
  admin: typeof authUsers.$inferSelect,
) {
  const jti = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    {
      sub: admin.id,
      role: admin.role,
      jti,
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
    },
    SECRET,
    JWT_ALGORITHM,
  );

  c.header(
    "Set-Cookie",
    `admin_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`,
  );

  c.set("user", admin);

  return c.json(
    {
      admin: {
        id: admin.id,
        role: admin.role,
        email: admin.email,
        hasPassword: admin.passwordHash !== null,
      },
    },
    200,
  );
}

// Clears the admin_session cookie and marks its jti revoked so the token
// can't be replayed even if it leaked before expiry — adminSessionAuth
// (src/middleware/auth.ts) already checks `revoked:<jti>` on every request,
// this is the first thing that ever writes it. Idempotent: a missing or
// already-invalid cookie is treated as "already logged out", not an error.
export async function adminLogout(c: Context) {
  const cookie = c.req.header("cookie") ?? "";
  const token = cookie.match(/admin_session=([^;]+)/)?.[1];

  if (token) {
    try {
      const payload = await verify(token, SECRET, JWT_ALGORITHM);
      const jti = payload.jti as string;
      const exp = payload.exp as number;
      const ttlSeconds = Math.max(1, exp - Math.floor(Date.now() / 1000));
      await redisClient.set(`revoked:${jti}`, "1", "EX", ttlSeconds);
    } catch {
      // Already expired/invalid/malformed — nothing to revoke.
    }
  }

  c.header(
    "Set-Cookie",
    "admin_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0",
  );

  return c.json({ ok: true }, 200);
}
