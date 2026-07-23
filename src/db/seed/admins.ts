import { getOrCreateUserByPrivyDid } from "@/services/identity";
import { db } from "..";
import { authUsers } from "../schema/rail2";
import { eq } from "drizzle-orm";

export async function seedAdmins() {
  const raw = Bun.env.ADMIN_PRIVY_DIDS;
  if (!raw) return;

  const dids = raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  for (const did of dids) {
    const user = await getOrCreateUserByPrivyDid(did);
    if (user.role !== "admin" && user.role !== "superadmin") {
      await db
        .update(authUsers)
        .set({ role: "admin" })
        .where(eq(authUsers.id, user.id));
    }
  }
}
