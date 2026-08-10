import { Context } from "hono";
import { db } from "@/db";
import { authUsers } from "@/db/schema/rail2";
import { eq, or } from "drizzle-orm";
import { nanoid } from "@/utils/nanoid";
import { getOrcreateAdminByPrivyDid } from "@/services/identity";
import { privy } from "@/privy";
import { checkRateLimit } from "@/utils/time";
import { sign } from "hono/jwt";
import { JWT_ALGORITHM } from "@/middleware/rail1-jwt";

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

  if (!admin || !admin.passwordHash || admin.status !== "active") {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  if (admin.role !== "admin" && admin.role !== "superadmin") {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  if (!(await Bun.password.verify(password, admin.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
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
    `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`,
  );

  return c.json(
    { admin: { id: admin.id, role: admin.role, email: admin.email } },
    200,
  );
}
