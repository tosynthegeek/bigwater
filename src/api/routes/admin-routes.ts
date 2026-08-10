import { Hono } from "hono";
import { getCustomSubmissions } from "@/api/controllers/submissions-controllers";
import {
  activateTask,
  createTask,
  deactivateTask,
  getAllTasks,
  updateTask,
} from "@/api/controllers/admin/admin-tasks-controllers";
import {
  reviewSubmission,
  deleteSubmission,
  getReadyForReviewSubmissions,
  getApprovedAndRejectedSubmissions,
} from "../controllers/admin/admin-submissions-controller";
import {
  getBands,
  getSubmissionLimits,
  updateBand,
  updateSubmissionLimits,
} from "../controllers/admin/admin-config-controllers";
import {
  adjustParticipantPoints,
  flagParticipant,
  getAllParticipants,
} from "../controllers/admin/admin-participants-controllers";
import {
  addAdmin,
  getAdmin,
  getAllAdmins,
  resetAdminPassword,
  revokeAdmin,
  updateOwnPassword,
} from "../controllers/admin/admin-controllers";
import {
  getPlatformOverview,
  sendTelegramBroadcast,
} from "../controllers/admin/admin-services-controllers";

const AdminRouter = new Hono();

AdminRouter.patch("/password", updateOwnPassword);
AdminRouter.patch("/admins/:adminUserId/password", resetAdminPassword);

AdminRouter.get("/tasks", getAllTasks);
AdminRouter.post("/tasks", createTask);
AdminRouter.patch("/tasks/:id", updateTask);
AdminRouter.patch("/tasks/:id/activate", activateTask);
AdminRouter.patch("/tasks/:id/deactivate", deactivateTask);

AdminRouter.get("/submission-limits", getSubmissionLimits);
AdminRouter.patch("/submission-limits", updateSubmissionLimits);

AdminRouter.get("/bands", getBands);
AdminRouter.patch("/bands/:id", updateBand);

AdminRouter.get("/submissions/custom", getCustomSubmissions);
AdminRouter.delete("/submissions/:id", deleteSubmission);
AdminRouter.get("/submissions/review", getReadyForReviewSubmissions);
AdminRouter.patch("/submissions/:id/review", reviewSubmission);
AdminRouter.get(
  "/submissions/approved-rejected",
  getApprovedAndRejectedSubmissions,
);

AdminRouter.get("/participants", getAllParticipants);
AdminRouter.patch("/participants/:userId/flag", flagParticipant);
AdminRouter.post("/participants/:userId/points", adjustParticipantPoints);
AdminRouter.get("/overview", getPlatformOverview);
AdminRouter.get("/admins", getAllAdmins);
AdminRouter.post("/add", addAdmin);
AdminRouter.post("/revoke", revokeAdmin);
AdminRouter.get("/profile", getAdmin);

AdminRouter.post("/telegram/broadcast", sendTelegramBroadcast);
export default AdminRouter;
