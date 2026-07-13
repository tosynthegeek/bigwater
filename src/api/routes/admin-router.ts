import { Hono } from "hono";
import { getCustomSubmissions } from "@/api/controllers/submissions-controllers";
import {
  createTask,
  deleteTask,
  updateTask,
} from "@/api/controllers/admin-tasks-controllers";
import {
  updateCustomSubmission,
  reviewSubmission,
  deleteSubmission,
} from "../controllers/admin-submissions-controller";
import {
  getBands,
  getSubmissionLimits,
  updateBand,
  updateSubmissionLimits,
} from "../controllers/admin-config-controllers";

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
AdminRouter.patch("/submissions/:id/review", reviewSubmission);
AdminRouter.patch("/submissions/:id/custom", updateCustomSubmission);

export default AdminRouter;
