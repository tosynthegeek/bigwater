import { Hono } from "hono";
import { getCustomSubmissions } from "@/api/controllers/submissions-controllers";
import {
  createTask,
  deleteTask,
  updateTask,
} from "@/api/controllers/admin-tasks-controllers";
import {
  reviewSubmission,
  deleteSubmission,
  getReadyForReviewSubmissions,
} from "../controllers/admin-submissions-controller";
import {
  getBands,
  getSubmissionLimits,
  updateBand,
  updateSubmissionLimits,
} from "../controllers/admin-config-controllers";
import {
  adjustParticipantPoints,
  flagParticipant,
  getAllParticipants,
} from "../controllers/admin-participants-controllers";
import { getPlatformOverview } from "../controllers/admin-controllers";

const AdminRouter = new Hono();

AdminRouter.post("/tasks", createTask);
AdminRouter.patch("/tasks/:id", updateTask);
AdminRouter.delete("/tasks/:id", deleteTask);

AdminRouter.get("/submission-limits", getSubmissionLimits);
AdminRouter.patch("/submission-limits", updateSubmissionLimits);

AdminRouter.get("/bands", getBands);
AdminRouter.patch("/bands/:id", updateBand);

AdminRouter.get("/submissions/custom", getCustomSubmissions);
AdminRouter.delete("/submissions/:id", deleteSubmission);
AdminRouter.get("/submissions/review", getReadyForReviewSubmissions);
AdminRouter.patch("/submissions/:id/review", reviewSubmission);

AdminRouter.get("/participants", getAllParticipants);
AdminRouter.patch("/participants/:userId/flag", flagParticipant);
AdminRouter.post("/participants/:userId/points", adjustParticipantPoints);
AdminRouter.get("/overview", getPlatformOverview);

export default AdminRouter;
