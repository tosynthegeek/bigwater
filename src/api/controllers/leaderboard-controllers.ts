import { Context } from "hono";

import {
  getGlobalLeaderboard,
  getMonthlyLeaderboard,
} from "@/services/leaderboard";

export async function globalLeaderboard(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const leaderboard = await getGlobalLeaderboard();

    return c.json({
      leaderboard,
    });
  } catch (error) {
    console.error("Leaderboard.Controllers.globalLeaderboard.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function monthlyLeaderboard(c: Context) {
  const month = c.req.query("month");

  if (!month) {
    return c.json(
      {
        error: "month required",
      },
      400,
    );
  }

  try {
    const leaderboard = await getMonthlyLeaderboard(month);

    return c.json({
      leaderboard,
    });
  } catch (error) {
    console.error("Leaderboard.Controllers.monthlyLeaderboard.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
