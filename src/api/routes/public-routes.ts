import { Hono } from "hono";
import {
  createTelegramLinkCode,
  getParticipantProfile,
  getParticipantSubmissions,
  login,
} from "@/api/controllers/participants-controllers";
import { listActiveTasks } from "@/api/controllers/tasks-controllers";
import {
  getSubmissionById,
  getSubmissionLimitsStatus,
  submitProof,
} from "@/api/controllers/submissions-controllers";
import {
  globalLeaderboard,
  monthlyLeaderboard,
} from "../controllers/leaderboard-controllers";

const ApiRouter = new Hono();

ApiRouter.get("/login", login);
ApiRouter.post("/telegram/link-code", createTelegramLinkCode);

ApiRouter.get("/tasks", listActiveTasks);
ApiRouter.post("/submissions/send", submitProof);
ApiRouter.get("/participants/profile", getParticipantProfile);
ApiRouter.get("/participants/submissions", getParticipantSubmissions);
// Static route must be registered before the dynamic /:id below, or Hono
// matches "/submissions/limits" as :id="limits" and this is never reached.
ApiRouter.get("/submissions/limits", getSubmissionLimitsStatus);
ApiRouter.get("/submissions/:id", getSubmissionById);
ApiRouter.get("/leaderboard", globalLeaderboard);
ApiRouter.get("/leaderboard/monthly", monthlyLeaderboard);

export default ApiRouter;
