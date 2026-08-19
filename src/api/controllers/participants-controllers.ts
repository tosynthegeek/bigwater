import { type Context } from "hono";
import { generateTelegramLinkCode } from "@/services/identity";
import { submissions, tasks, type User } from "@/db/schema/rail2";
import { db } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getUserScoreSummary } from "@/services/score";
import { getUserSubmissions } from "@/services/submissions/submissions";

// Web app calls this (authenticated) when the user clicks "link Telegram".
// Returns a code the frontend turns into t.me/<bot_username>?start=<code>.
export async function createTelegramLinkCode(c: Context) {
  const user = c.get("user") as User;

  try {
    const { code, expiresAt } = await generateTelegramLinkCode(user.id);
    return c.json({ code, expiresAt }, 200);
  } catch (error) {
    console.error(
      "Controllers.participants-controllers.createTelegramLinkCode.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getParticipantProfile(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const now = new Date();

  try {
    const profile = await getUserScoreSummary(user.id);

    if (!profile) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ profile }, 200);
  } catch (error) {
    console.error(
      "Controllers.participants-controllers.getParticipantProfile.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getParticipantSubmissions(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const result = await getUserSubmissions(user.id);

    return c.json({ submissions: result }, 200);
  } catch (error) {
    console.error(
      "Controllers.participants-controllers.getParticipantSubmissions.error: ",
      error,
    );
    return c.json({ error: "Internal server error" }, 500);
  }
}

// export async function linkRailOne(c: Context) {
//   const user = c.get("user") as User | null;
//   const rail1Token = c.req.header("x-rail1-token");

//   if (!user) {
//     return c.json({ error: "unauthenticated" }, 401);
//   }

//   if (!rail1Token) {
//     return c.json(
//       {
//         error: "missing_rail1_token",
//         message: "X-Rail1-Token header required",
//       },
//       400,
//     );
//   }

//   if (!user.participantProfile) {
//     return c.json(
//       { error: "no_profile", message: "participant profile not found", user },
//       500,
//     );
//   }

//   if (user.participantProfile.rail1UserId) {
//     return c.json({
//       linked: true,
//       rail1UserId: user.participantProfile.rail1UserId,
//     });
//   }

//   try {
//     const rail1UserId = await verifyRail1Token(rail1Token);

//     const [existingProfile] = await db
//       .select()
//       .from(rail1Users)
//       .where(eq(rail1Users.id, rail1UserId))
//       .limit(1);

//     if (!existingProfile) {
//       console.error(
//         `Controllers.participants-controllers.linkRailOne.error: Rail1 user not found for rail1UserId=${rail1UserId}`,
//       );
//       return c.json({ error: "Rail1 user not found" }, 404);
//     }

//     const [updated] = await db
//       .update(participantProfile)
//       .set({ rail1UserId })
//       .where(eq(participantProfile.id, user.participantProfile.id))
//       .returning();

//     if (!updated) {
//       return c.json({ error: "partcipant not found for user not found" }, 404);
//     }
//     return c.json({ linked: true, rail1UserId: updated.rail1UserId, user });
//   } catch (err) {
//     return c.json(
//       { error: "invalid_rail1_token", message: (err as Error).message },
//       401,
//     );
//   }
// }
