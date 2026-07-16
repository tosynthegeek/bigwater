import { Context } from "hono";
import {
  getUserLeaderboardContext,
  type LeaderboardTimeframe,
  getLeaderboard,
} from "@/services/leaderboard";

const TIMEFRAMES: LeaderboardTimeframe[] = ["global", "weekly", "monthly"];

function parsePagination(c: Context) {
  const rawLimit = parseInt(c.req.query("limit") ?? "", 10);
  const rawOffset = parseInt(c.req.query("offset") ?? "", 10);
  return {
    limit: Math.min(
      Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1),
      100,
    ),
    offset: Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0),
  };
}

export async function leaderboard(c: Context) {
  const user = c.get("user");
  if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

  const timeframe = (c.req.query("timeframe") ??
    "global") as LeaderboardTimeframe;
  if (!TIMEFRAMES.includes(timeframe)) {
    return c.json(
      { error: `timeframe must be one of: ${TIMEFRAMES.join(", ")}` },
      400,
    );
  }

  const month = c.req.query("month");
  if (timeframe === "monthly" && !month) {
    return c.json(
      { error: "month parameter is required for timeframe=monthly" },
      400,
    );
  }

  const { limit, offset } = parsePagination(c);

  try {
    const [board, userContext] = await Promise.all([
      getLeaderboard(timeframe, {
        limit,
        offset,
        month,
        currentUserId: user.id,
      }),
      getUserLeaderboardContext(user.id, timeframe, month),
    ]);

    return c.json({ leaderboard: board, user: userContext });
  } catch (error) {
    console.error("Leaderboard.Controllers.leaderboard.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
