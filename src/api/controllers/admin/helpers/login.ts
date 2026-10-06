import { Context } from "hono";
import { randomInt, createHash } from "node:crypto";
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
import { sendOtpEmail } from "@/services/email/otp";
import { audit } from "@/services/logger/audit";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const OTP_TTL_SECONDS = 60 * 5;
export const MAX_OTP_ATTEMPTS = 5;
const SECRET = Bun.env.ADMIN_SESSION_SECRET;

function generateOtpCode(): string {
  // 6-digit numeric, cryptographically random (not Math.random)
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// CHANGED: this replaces the old direct call to issueAdminSession from
// handlePasswordLogin / handlePrivyLogin. It verifies identity/credentials
// as before, but instead of issuing a session, it starts an OTP challenge.
async function initiateOtpChallenge(
  c: Context,
  admin: typeof authUsers.$inferSelect,
) {
  if (!admin.email) {
    // Can't OTP an admin with no email on file — decide how you want to
    // handle this (block login, fall back to direct session, etc).
    await audit(c, {
      action: "auth.otp.no_email",
      outcome: "failure",
      actor: admin,
    });
    return c.json({ error: "No email on file for OTP verification" }, 400);
  }

  const code = generateOtpCode();
  const pendingToken = nanoid();

  await redisClient.set(
    `otp:${pendingToken}`,
    JSON.stringify({ adminId: admin.id, codeHash: hashOtp(code), attempts: 0 }),
    "EX",
    OTP_TTL_SECONDS,
  );

  await sendOtpEmail(admin.email, code);

  await audit(c, {
    action: "auth.otp.sent",
    outcome: "success",
    actor: admin,
    targetType: "admin",
    targetId: admin.id,
  });

  return c.json(
    {
      otpRequired: true,
      pendingToken,
      expiresInSeconds: OTP_TTL_SECONDS,
    },
    200,
  );
}

export async function handlePrivyLogin(c: Context, token: string) {
  let admin;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    admin = await getOrcreateAdminByPrivyDid(claims.user_id);
  } catch (err) {
    console.error("[adminLogin:privy]", (err as Error)?.message);
    await audit(c, {
      action: "auth.login.failed",
      outcome: "denied",
      actor: null,
      metadata: { method: "privy", reason: "token_invalid_or_lookup_failed" },
    });
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!admin || (admin.role !== "admin" && admin.role !== "superadmin")) {
    await audit(c, {
      action: "auth.login.failed",
      outcome: "denied",
      actor: admin ?? null,
      metadata: { method: "privy", reason: "not_admin" },
    });
    return c.json({ error: "Unauthorized" }, 403);
  }

  // log that OTP is sent for privy login
  console.log(
    `[adminLogin:privy] OTP sent to ${admin.email} for admin ID ${admin.id}`,
  );

  return initiateOtpChallenge(c, admin);
}

export async function handlePasswordLogin(
  c: Context,
  identifier: string,
  password: string,
) {
  try {
    await checkRateLimit(`admin-login:${identifier}`);
  } catch {
    await audit(c, {
      action: "auth.login.failed",
      outcome: "denied",
      actor: null,
      metadata: { method: "password", identifier, reason: "rate_limited" },
    });
    return c.json({ error: "Too many attempts, try again later" }, 429);
  }

  const admin = await db.query.authUsers.findFirst({
    where: or(
      eq(authUsers.email, identifier),
      eq(authUsers.username, identifier),
    ),
  });
  // The client always gets the same generic 401; the audit row records the
  // real reason internally.
  const failLogin = async (reason: string) => {
    await audit(c, {
      action: "auth.login.failed",
      outcome: "denied",
      actor: admin ?? null,
      metadata: { method: "password", identifier, reason },
    });
    return c.json({ error: "Invalid credentials" }, 401);
  };

  if (!admin) return failLogin("unknown_identifier");
  if (!admin.passwordHash) return failLogin("no_password_set");
  if (admin.status !== "active") return failLogin("account_inactive");
  if (admin.role !== "admin" && admin.role !== "superadmin") {
    return failLogin("not_admin");
  }
  if (!(await Bun.password.verify(password, admin.passwordHash))) {
    return failLogin("bad_password");
  }

  return initiateOtpChallenge(c, admin);
}

// Unchanged — now only reachable after OTP verification succeeds.
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

  await audit(c, {
    action: "auth.login.success",
    outcome: "success",
    actor: admin,
    targetType: "admin",
    targetId: admin.id,
    metadata: { jti },
  });

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
      await audit(c, {
        action: "auth.logout",
        outcome: "success",
        actor: { id: payload.sub as string, role: payload.role as string },
        metadata: { jti },
      });
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
