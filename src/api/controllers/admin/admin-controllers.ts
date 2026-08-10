import { Context } from "hono";
import { db } from "@/db";
import { authUsers, type User } from "@/db/schema/rail2";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  addAdminBodySchema,
  resetAdminPasswordSchema,
  revokeAdminSchema,
  updateOwnPasswordSchema,
} from "@/zod/admin";
import { handlePasswordLogin, handlePrivyLogin } from "./helpers/login";

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
      const identifier = (email ?? walletAddress)!;
      const [created] = await db
        .insert(authUsers)
        .values({
          privyDid: identifier.toLocaleLowerCase(),
          role: "admin",
        })
        .returning();

      return c.json({ admin: created }, 201);
    }

    const { email, username, password } = validatedBody.data;
    const passwordHash = await Bun.password.hash(password);

    const [created] = await db
      .insert(authUsers)
      .values({
        email: email.toLowerCase(),
        username,
        passwordHash,
        role: "admin",
        status: "active",
      })
      .returning();

    return c.json({ admin: created }, 201);
  } catch (error: any) {
    if (error?.code === "23505") {
      return c.json({ error: "Email or username already in use" }, 409);
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

    return c.json({ admin }, 200);
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
