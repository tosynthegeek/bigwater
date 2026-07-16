import { Context } from "hono";
import {
  getGlobalLeaderboard,
  getWeeklyLeaderboard,
  getMonthlyLeaderboard,
  getUserLeaderboardContext,
} from "@/services/leaderboard";

export async function globalLeaderboard(c: Context) {
  const user = c.get("user");
  if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 50);
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    const [leaderboard, userContext] = await Promise.all([
      getGlobalLeaderboard(limit, offset, user.id),
      getUserLeaderboardContext(user.id),
    ]);

    return c.json({
      leaderboard,
      user: userContext,
    });
  } catch (error) {
    console.error("Leaderboard.Controllers.globalLeaderboard.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function weeklyLeaderboard(c: Context) {
  const user = c.get("user");
  if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    const [leaderboard, userContext] = await Promise.all([
      getWeeklyLeaderboard(limit, offset, user.id),
      getUserLeaderboardContext(user.id, "weekly"),
    ]);

    return c.json({
      leaderboard,
      user: userContext,
    });
  } catch (error) {
    console.error("Leaderboard.Controllers.weeklyLeaderboard.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function monthlyLeaderboard(c: Context) {
  const user = c.get("user");
  if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

  const month = c.req.query("month");
  if (!month) return c.json({ error: "month parameter is required" }, 400);

  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    const [leaderboard, userContext] = await Promise.all([
      getMonthlyLeaderboard(month, limit, offset, user.id),
      getUserLeaderboardContext(user.id, "monthly", month),
    ]);

    return c.json({
      leaderboard,
      user: userContext,
    });
  } catch (error) {
    console.error("Leaderboard.Controllers.monthlyLeaderboard.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
