import { type Context } from "hono";
import { generateTelegramLinkCode } from "@/services/identity";
import { participantProfile, type users } from "@/db/schema/bigwater";
import { db } from "@/db";
import { eq } from "drizzle-orm";

type User = typeof users.$inferSelect;

export async function login(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const [profile] = await db
      .select()
      .from(participantProfile)
      .where(eq(participantProfile.userId, user.id));

    const isTelegramLinked = !!profile?.telegramId;

    return c.json({ user, isTelegramLinked }, 200);
  } catch (error) {
    console.error(
      "Identity.Controllers.participants-controllers.login.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Web app calls this (authenticated) when the user clicks "link Telegram".
// Returns a code the frontend turns into t.me/<bot_username>?start=<code>.
export async function createTelegramLinkCode(c: Context) {
  const user = c.get("user") as User;

  try {
    const { code, expiresAt } = await generateTelegramLinkCode(user.id);
    return c.json({ code, expiresAt }, 200);
  } catch (error) {
    console.error(
      "Identity.Controllers.participants-controllers.createTelegramLinkCode.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}
