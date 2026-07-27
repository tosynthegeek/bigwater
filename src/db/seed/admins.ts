import { getOrCreateUserByPrivyDid } from "@/services/identity";
import { db } from "..";
import { authUsers } from "../schema/rail2";
import { eq } from "drizzle-orm";
import { parseIdentifier } from "@/zod/admin";

export async function seedAdmins() {
  const raw = Bun.env.ADMIN_PRIVY_DIDS;
  if (!raw) return;

  const identifiers = raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  for (const identifier of identifiers) {
    let parsed: { email?: string; walletAddress?: string };
    try {
      parsed = parseIdentifier(identifier);
    } catch {
      console.error(`[seedAdmins] skipping invalid identifier: ${identifier}`);
      continue;
    }
    
    const normalizedIdentifier = (parsed.email ?? parsed.walletAddress)!;
    try {
      const existing = await db.query.authUsers.findFirst({
        where: parsed.email
          ? eq(authUsers.email, parsed.email)
          : eq(authUsers.walletAddress, parsed.walletAddress!),
      });

      if (existing) {
        if (existing.role !== "superadmin") {
          await db
            .update(authUsers)
            .set({ role: "superadmin" })
            .where(eq(authUsers.id, existing.id));
        }
        continue;
      }

      await db
        .insert(authUsers)
        .values({
          privyDid: normalizedIdentifier,
          email: parsed.email ?? null,
          walletAddress: parsed.walletAddress ?? null,
          role: "superadmin",
        })
        .onConflictDoNothing({ target: authUsers.privyDid });
    } catch (error) {
      console.error(`[seedAdmins] failed for identifier ${identifier}:`, error);
    }
  }
}
