import { Hono } from "hono";
import {
  createTelegramLinkCode,
  getParticipantProfile,
  getParticipantSubmissions,
  linkRailOne,
} from "@/api/controllers/participants-controllers";
import { listActiveTasks } from "@/api/controllers/tasks-controllers";
import {
  getSubmissionById,
  getSubmissionLimitsStatus,
  submitProof,
} from "@/api/controllers/submissions-controllers";
import { leaderboard } from "../controllers/leaderboard-controllers";
import { publicRateLimiter } from "@/middleware/rate-limit";

const ApiRouter = new Hono();

ApiRouter.get("/link-rail1", publicRateLimiter, linkRailOne);
ApiRouter.get("/tasks", listActiveTasks);
ApiRouter.post("/submissions/send", submitProof);
ApiRouter.get("/participants/profile", getParticipantProfile);
ApiRouter.get("/participants/submissions", getParticipantSubmissions);
// Static route must be registered before the dynamic /:id below, or Hono
// matches "/submissions/limits" as :id="limits" and this is never reached.
ApiRouter.get("/submissions/limits", getSubmissionLimitsStatus);
ApiRouter.get("/submissions/:id", getSubmissionById);
ApiRouter.get("/leaderboard", leaderboard);
ApiRouter.post("/telegram/link-code", createTelegramLinkCode);

export default ApiRouter;
