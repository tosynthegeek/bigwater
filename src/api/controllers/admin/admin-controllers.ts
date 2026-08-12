import { Context } from "hono";
import { db } from "@/db";
import { authUsers, type User } from "@/db/schema/rail2";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  addAdminBodySchema,
  resetAdminPasswordSchema,
  revokeAdminSchema,
  updateOwnPasswordSchema,
} from "@/zod/admin";
import { handlePasswordLogin, handlePrivyLogin } from "./helpers/login";

// Finds any existing row for this identity, whether it's a currently-claimed
// account (email/walletAddress populated) or a still-unclaimed placeholder
// (this codebase's convention: privyDid holds the raw email/wallet string
// until a real Privy login claims it — see getOrcreateAdminByPrivyDid in
// services/identity.ts). Matching only email/walletAddress would miss the
// unclaimed-placeholder shape entirely.
async function findExistingByIdentifier(email?: string, walletAddress?: string) {
  const identifier = (email ?? walletAddress)!.toLowerCase();
  return db.query.authUsers.findFirst({
    where: or(
      eq(sql`lower(${authUsers.privyDid})`, identifier),
      email ? eq(authUsers.email, identifier) : undefined,
      walletAddress ? eq(authUsers.walletAddress, identifier) : undefined,
    ),
  });
}

export async function adminLogin(c: Context) {
  const authHeader = c.req.header("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    return handlePrivyLogin(c, authHeader.slice(7));
  }

  const body = await c.req.json().catch(() => null);
  if (body?.identifier && body?.password) {
    return handlePasswordLogin(c, body.identifier, body.password);
  }

  return c.json({ error: "No valid credentials provided" }, 400);
}

export async function getAllAdmins(c: Context) {
  try {
    const admins = await db
      .select({
        id: authUsers.id,
        privyDid: authUsers.privyDid,
        role: authUsers.role,
        email: authUsers.email,
        wallet: authUsers.walletAddress,
        status: authUsers.status,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      })
      .from(authUsers)
      .where(inArray(authUsers.role, ["admin", "superadmin"]))
      .orderBy(desc(authUsers.createdAt));

    return c.json({ admins });
  } catch (error) {
    console.error("AdminControllers.getAllAdmins.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function addAdmin(c: Context) {
  const user = c.get("user") as User;

  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();

  const validatedBody = addAdminBodySchema.safeParse(body);
  if (!validatedBody.success) {
    return c.json(
      {
        error: "Invalid request body",
        details: validatedBody.error.issues,
      },
      400,
    );
  }

  try {
    if (validatedBody.data.method === "privy") {
      const { email, walletAddress } = validatedBody.data.identifier;
      const identifier = (email ?? walletAddress)!.toLowerCase();
      const existing = await findExistingByIdentifier(email, walletAddress);

      if (existing) {
        // Only ever true for a previously-revoked admin — revokeAdmin
        // (below) is the sole writer of status:"inactive" anywhere in this
        // codebase, and an unclaimed placeholder always has role:"admin"
        // (never "user"), so there's no ambiguity with a pending invite
        // here. Reactivate the same row instead of inserting a duplicate —
        // this is the fix for the "re-invite silently orphaned" bug.
        if (existing.role === "user" && existing.status === "inactive") {
          const [reactivated] = await db
            .update(authUsers)
            .set({ role: "admin", status: "active" })
            .where(eq(authUsers.id, existing.id))
            .returning();

          return c.json({ admin: reactivated, reactivated: true }, 200);
        }

        // Already an active admin/superadmin, or an unclaimed invite
        // already pending for this identity — don't silently overwrite
        // either; tell the caller plainly what's actually going on.
        const pending = !existing.email && !existing.walletAddress;
        return c.json(
          {
            error: pending
              ? "This identity has already been invited and is awaiting claim."
              : `This identity already has an account (role: ${existing.role}, status: ${existing.status}).`,
          },
          409,
        );
      }

      const [created] = await db
        .insert(authUsers)
        .values({
          privyDid: identifier,
          role: "admin",
        })
        .returning();

      return c.json({ admin: created, reactivated: false }, 201);
    }

    const { email, username, password } = validatedBody.data;
    const normalizedEmail = email.toLowerCase();
    const existing = await findExistingByIdentifier(normalizedEmail);

    if (existing) {
      if (existing.role === "user" && existing.status === "inactive") {
        const passwordHash = await Bun.password.hash(password);
        const [reactivated] = await db
          .update(authUsers)
          .set({
            role: "admin",
            status: "active",
            username,
            passwordHash,
          })
          .where(eq(authUsers.id, existing.id))
          .returning();

        return c.json({ admin: reactivated, reactivated: true }, 200);
      }

      const pending = !existing.email && !existing.walletAddress;
      return c.json(
        {
          error: pending
            ? "This identity has already been invited and is awaiting claim."
            : `This identity already has an account (role: ${existing.role}, status: ${existing.status}).`,
        },
        409,
      );
    }

    const passwordHash = await Bun.password.hash(password);

    const [created] = await db
      .insert(authUsers)
      .values({
        email: normalizedEmail,
        username,
        passwordHash,
        role: "admin",
        status: "active",
      })
      .returning();

    return c.json({ admin: created, reactivated: false }, 201);
  } catch (error: any) {
    if (error?.code === "23505") {
      // Best-effort: report which identity column actually collided rather
      // than a blanket message — falls back to the generic message if the
      // driver doesn't expose a constraint name in the shape expected here.
      const constraint: string | undefined = error?.constraint;
      const field = constraint?.includes("email")
        ? "email"
        : constraint?.includes("username")
          ? "username"
          : constraint?.includes("wallet_address")
            ? "wallet address"
            : constraint?.includes("privy_did")
              ? "identifier"
              : undefined;

      return c.json(
        {
          error: field
            ? `This ${field} is already in use by another account.`
            : "Email or username already in use",
        },
        409,
      );
    }

    console.error("AdminControllers.addAdmin.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function revokeAdmin(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (user.role != "superadmin") {
    return c.json({ error: "Not authorized" }, 403);
  }

  const body = await c.req.json();
  const parsed = revokeAdminSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request body", details: parsed.error.issues },
      400,
    );
  }

  if (parsed.data.id === user.id) {
    return c.json({ error: "Cannot revoke your own admin access" }, 400);
  }

  try {
    const [revoked] = await db
      .update(authUsers)
      .set({
        role: "user",
        status: "inactive",
      })
      .where(eq(authUsers.id, parsed.data.id))
      .returning();

    if (!revoked) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ revoked }, 200);
  } catch (error) {
    console.error("AdminControllers.revokeAdmin.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getAdmin(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user || (user.role != "superadmin" && user.role != "admin")) {
    return c.json({ error: "Unauthorized access" }, 401);
  }

  try {
    const [admin] = await db
      .select()
      .from(authUsers)
      .where(
        and(
          eq(authUsers.id, user.id),
          inArray(authUsers.role, ["admin", "superadmin"]),
        ),
      );

    if (!admin) {
      return c.json({ error: "Admin not found" }, 404);
    }

    // passwordHash was being sent to the client verbatim — strip it and
    // expose only whether one is set, which is what the frontend actually
    // needs (e.g. to hide "Change my password" for Privy-only admins).
    const { passwordHash, ...safeAdmin } = admin;

    return c.json(
      { admin: { ...safeAdmin, hasPassword: passwordHash !== null } },
      200,
    );
  } catch (error) {
    console.error("AdminControllers.getAdmin.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function updateOwnPassword(c: Context) {
  const user = c.get("user") as User;
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const validated = updateOwnPasswordSchema.safeParse(body);
  if (!validated.success) {
    return c.json(
      { error: "Invalid request body", details: validated.error.issues },
      400,
    );
  }

  try {
    const [admin] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, user.id));
    if (!admin?.passwordHash) {
      return c.json(
        { error: "Password login is not enabled for this account" },
        400,
      );
    }

    const valid = await Bun.password.verify(
      validated.data.currentPassword,
      admin.passwordHash,
    );
    if (!valid) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    const newHash = await Bun.password.hash(validated.data.newPassword);
    await db
      .update(authUsers)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, admin.id));

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error("AdminControllers.updateOwnPassword.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function resetAdminPassword(c: Context) {
  const user = c.get("user") as User;
  if (!user || user.role !== "superadmin") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const targetAdminId = c.req.param("adminUserId");
  if (!targetAdminId) {
    return c.json({ error: "Admin ID is required" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const validated = resetAdminPasswordSchema.safeParse(body);
  if (!validated.success) {
    return c.json(
      { error: "Invalid request body", details: validated.error.issues },
      400,
    );
  }

  try {
    const [target] = await db
      .select()
      .from(authUsers)
      .where(
        and(
          eq(authUsers.id, targetAdminId),
          inArray(authUsers.role, ["admin", "superadmin"]),
        ),
      );

    if (!target) {
      return c.json({ error: "Admin not found" }, 404);
    }

    const newHash = await Bun.password.hash(validated.data.newPassword);
    await db
      .update(authUsers)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, target.id));

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error("AdminControllers.resetAdminPassword.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
