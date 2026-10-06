import { Hono } from "hono";
import { getCustomSubmissions } from "@/api/controllers/submissions-controllers";
import { adminLogout } from "@/api/controllers/admin/helpers/login";
import {
  activateTask,
  createTask,
  deactivateTask,
  getAllTasks,
  getDailyTaskSelection,
  getTaskSchedule,
  getWeeklyTaskTemplate,
  setDailyTasks,
  setTaskSchedule,
  setWeeklyTaskTemplate,
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
  warnParticipant,
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
import { withAudit } from "@/services/logger/audit";

const AdminRouter = new Hono();

AdminRouter.patch(
  "/password",
  withAudit("admin.password.change", updateOwnPassword, {
    targetType: "admin",
  }),
);
AdminRouter.patch(
  "/admins/:adminUserId/password",
  withAudit("admin.password.reset", resetAdminPassword, {
    targetType: "admin",
    targetParam: "adminUserId",
  }),
);
AdminRouter.get("/admins", getAllAdmins);
AdminRouter.post(
  "/add",
  withAudit("admin.add", addAdmin, { targetType: "admin" }),
);
AdminRouter.post(
  "/revoke",
  withAudit("admin.revoke", revokeAdmin, { targetType: "admin" }),
);
AdminRouter.get("/profile", getAdmin);
AdminRouter.post("/logout", adminLogout); // audited inside helpers/login.ts

// Tasks
AdminRouter.get("/tasks", getAllTasks);
AdminRouter.post(
  "/tasks",
  withAudit("task.create", createTask, { targetType: "task" }),
);
AdminRouter.patch(
  "/tasks/:id",
  withAudit("task.update", updateTask, {
    targetType: "task",
    targetParam: "id",
  }),
);
AdminRouter.patch(
  "/tasks/:id/activate",
  withAudit("task.activate", activateTask, {
    targetType: "task",
    targetParam: "id",
  }),
);
AdminRouter.patch(
  "/tasks/:id/deactivate",
  withAudit("task.deactivate", deactivateTask, {
    targetType: "task",
    targetParam: "id",
  }),
);
AdminRouter.get("/tasks/daily-selection", getDailyTaskSelection);
AdminRouter.post(
  "/tasks/daily-selection",
  withAudit("task.daily_selection.set", setDailyTasks, {
    targetType: "daily_task_selection",
  }),
);

// Dated schedule: body { date: "YYYY-MM-DD", taskIds: [...] } (empty = clear)
AdminRouter.get("/tasks/schedule", getTaskSchedule);
AdminRouter.post(
  "/tasks/schedule",
  withAudit("task.schedule.set", setTaskSchedule, {
    targetType: "scheduled_task_selection",
  }),
);

// Weekly loop: body { weekday: 0-6 (0 = Sunday), taskIds: [...] } (empty = clear)
AdminRouter.get("/tasks/weekly-template", getWeeklyTaskTemplate);
AdminRouter.post(
  "/tasks/weekly-template",
  withAudit("task.weekly_template.set", setWeeklyTaskTemplate, {
    targetType: "weekly_task_template",
  }),
);

AdminRouter.get("/submission-limits", getSubmissionLimits);
AdminRouter.patch(
  "/submission-limits",
  withAudit("config.submission_limits.update", updateSubmissionLimits, {
    targetType: "submission_limits",
  }),
);
AdminRouter.get("/bands", getBands);
AdminRouter.patch(
  "/bands/:id",
  withAudit("config.band.update", updateBand, {
    targetType: "band",
    targetParam: "id",
  }),
);

// Submissions
AdminRouter.get("/submissions/custom", getCustomSubmissions);
AdminRouter.delete(
  "/submissions/:id",
  withAudit("submission.delete", deleteSubmission, {
    targetType: "submission",
    targetParam: "id",
  }),
);
AdminRouter.get("/submissions/review", getReadyForReviewSubmissions);
AdminRouter.patch(
  "/submissions/:id/review",
  withAudit("submission.review", reviewSubmission, {
    targetType: "submission",
    targetParam: "id",
  }),
);
AdminRouter.get(
  "/submissions/approved-rejected",
  getApprovedAndRejectedSubmissions,
);

// Participants
AdminRouter.get("/participants", getAllParticipants);
AdminRouter.post(
  "/participants/:participantId/warn",
  withAudit("participant.warn", warnParticipant, {
    targetType: "participant_profile",
    targetParam: "participantId",
  }),
);
AdminRouter.patch(
  "/participants/:userId/flag",
  withAudit("participant.flag", flagParticipant, {
    targetType: "user",
    targetParam: "userId",
  }),
);
AdminRouter.post(
  "/participants/:userId/points",
  withAudit("participant.adjust_points", adjustParticipantPoints, {
    targetType: "user",
    targetParam: "userId",
  }),
);

// Platform
AdminRouter.get("/overview", getPlatformOverview);
AdminRouter.post(
  "/telegram/broadcast",
  withAudit("telegram.broadcast", sendTelegramBroadcast, {
    targetType: "broadcast",
  }),
);

export default AdminRouter;
