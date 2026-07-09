import { Hono } from "hono";
import { privyAuth, requireAuth, requireAdmin } from "@/middleware/auth";
import {
  createTelegramLinkCode,
  login,
} from "@/api/controllers/participants-controllers";
import { listActiveTasks } from "@/api/controllers/tasks-controllers";
import { submitProof } from "@/api/controllers/submissions-controllers";
import { createTaskController } from "@/api/controllers/admin-tasks-controllers";
import {
  globalLeaderboard,
  monthlyLeaderboard,
} from "../controllers/leaderboard-controllers";

const ApiRouter = new Hono();

ApiRouter.get("/health", async (c) => {
  return c.json({ status: "ok" }, 200);
});

// login
ApiRouter.get("/login", privyAuth, requireAuth, login);
ApiRouter.post(
  "/telegram/link-code",
  privyAuth,
  requireAuth,
  createTelegramLinkCode,
);

ApiRouter.get("/tasks", privyAuth, requireAuth, listActiveTasks);
ApiRouter.post("/submissions", privyAuth, requireAuth, submitProof);

ApiRouter.post(
  "/admin/tasks",
  privyAuth,
  requireAuth,
  requireAdmin,
  createTaskController,
);

ApiRouter.get("/leaderboard", globalLeaderboard);

ApiRouter.get("/leaderboard/monthly", monthlyLeaderboard);

export default ApiRouter;
