import { type Context } from "hono";
import {
  createtask,
  DailySelectionError,
  formatDailyTasksAnnouncement,
  getDailySelectionStatus,
  getWeeklyTemplate,
  listScheduledSelections,
  setDailyTaskSelection,
  setScheduledSelection,
  setWeeklyTemplateDay,
} from "@/services/tasks";
import { db } from "@/db";
import { tasks, type User } from "@/db/schema/rail2";
import {
  createTaskSchema,
  setTaskScheduleSchema,
  setWeeklyTemplateSchema,
  updateTaskSchema,
} from "@/zod/task";
import { setDailyTaskSelectionSchema } from "@/zod/task";
import { eq } from "drizzle-orm";
import { setAuditMeta } from "@/services/logger/audit";
import { telegramMarketingQueue } from "@/services/queues/telegram-marketing.queue";

export async function createTask(c: Context) {
  const body = await c.req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request body", details: parsed.error },
      400,
    );
  }

  const task = await createtask(parsed.data);
  return c.json({ task }, 201);
}

export async function updateTask(c: Context) {
  const taskId = c.req.param("id");

  if (!taskId) {
    return c.json({ error: "Task ID is required" }, 400);
  }

  const body = await c.req.json();

  const validatedBody = updateTaskSchema.safeParse(body);

  if (!validatedBody.success) {
    return c.json(
      {
        error: "Invalid request body",
        details: validatedBody.error.issues,
      },
      400,
    );
  }

  try {
    const existingTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    if (!existingTask) {
      return c.json({ error: "Task not found" }, 404);
    }

    const [updatedTask] = await db
      .update(tasks)
      .set({
        ...validatedBody.data,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return c.json({ task: updatedTask });
  } catch (error) {
    console.error("AdminTasks.Controllers.updateTaskController.error: ", error);

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function deactivateTask(c: Context) {
  const taskId = c.req.param("id");

  if (!taskId) {
    return c.json({ error: "Task ID is required" }, 400);
  }

  try {
    const existingTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    if (!existingTask) {
      return c.json({ error: "Task not found" }, 404);
    }

    const [deactivatedTask] = await db
      .update(tasks)
      .set({
        active: false,
      })
      .where(eq(tasks.id, taskId))
      .returning();

    // Deactivating a task that's part of the live selection (today's, or the
    // most recent one carried forward) silently shrinks the live list below 5
    // — selectionForDay filters on tasks.active. Scheduled and weekly-template
    // entries for this task are skipped when their day is materialized. That's
    // intentional (deactivateTask elsewhere in the codebase has no separate
    // "unpublish" step) but worth surfacing to whoever reviews the audit log.
    setAuditMeta(c, { title: deactivatedTask?.title });

    return c.json({ task: deactivatedTask });
  } catch (error) {
    console.error(
      "AdminTasks.Controllers.deactivateTaskController.error: ",
      error,
    );

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getAllTasks(c: Context) {
  try {
    const allTasks = await db.query.tasks.findMany();

    return c.json({ tasks: allTasks });
  } catch (error) {
    console.error("AdminTasks.Controllers.getAllTasksController.error:", error);

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function activateTask(c: Context) {
  const taskId = c.req.param("id");

  if (!taskId) {
    return c.json({ error: "Task ID is required" }, 400);
  }

  try {
    const existingTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    if (!existingTask) {
      return c.json({ error: "Task not found" }, 404);
    }

    const [activatedTask] = await db
      .update(tasks)
      .set({
        active: true,
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return c.json({ task: activatedTask });
  } catch (error) {
    console.error(
      "AdminTasks.Controllers.activateTaskController.error:",
      error,
    );

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getDailyTaskSelection(c: Context) {
  try {
    const status = await getDailySelectionStatus();
    return c.json(status, 200);
  } catch (error) {
    console.error("AdminTasks.Controllers.getDailyTaskSelection.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function setDailyTasks(c: Context) {
  const admin = c.get("user") as User;

  const body = await c.req.json().catch(() => null);
  const validated = setDailyTaskSelectionSchema.safeParse(body);
  if (!validated.success) {
    return c.json(
      { error: "Invalid request body", details: validated.error.issues },
      400,
    );
  }

  try {
    const result = await setDailyTaskSelection(
      validated.data.taskIds,
      admin.id,
    );

    setAuditMeta(c, {
      taskIds: validated.data.taskIds,
      changed: result.changed,
      notified: false,
    });

    const shouldNotify = result.changed && validated.data.notify !== false;
    if (shouldNotify) {
      await telegramMarketingQueue.add("broadcast", {
        message: formatDailyTasksAnnouncement(result.tasks),
        initiatedBy: admin.id,
      });
      setAuditMeta(c, { notified: true });
    }

    return c.json({ tasks: result.tasks, changed: result.changed }, 200);
  } catch (error) {
    if (error instanceof DailySelectionError) {
      return c.json({ error: error.message }, 400);
    }
    console.error("AdminTasks.Controllers.setDailyTasks.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getTaskSchedule(c: Context) {
  try {
    const schedule = await listScheduledSelections();
    return c.json({ schedule }, 200);
  } catch (error) {
    console.error("AdminTasks.Controllers.getTaskSchedule.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function setTaskSchedule(c: Context) {
  const admin = c.get("user") as User;

  const body = await c.req.json().catch(() => null);
  const validated = setTaskScheduleSchema.safeParse(body);
  if (!validated.success) {
    return c.json(
      { error: "Invalid request body", details: validated.error.issues },
      400,
    );
  }

  try {
    const result = await setScheduledSelection(
      validated.data.date,
      validated.data.taskIds,
      admin.id,
    );

    setAuditMeta(c, {
      date: result.date,
      taskIds: result.taskIds,
      cleared: result.taskIds.length === 0,
    });

    return c.json(result, 200);
  } catch (error) {
    if (error instanceof DailySelectionError) {
      return c.json({ error: error.message }, 400);
    }
    console.error("AdminTasks.Controllers.setTaskSchedule.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getWeeklyTaskTemplate(c: Context) {
  try {
    const days = await getWeeklyTemplate();
    return c.json({ days }, 200);
  } catch (error) {
    console.error("AdminTasks.Controllers.getWeeklyTaskTemplate.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function setWeeklyTaskTemplate(c: Context) {
  const admin = c.get("user") as User;

  const body = await c.req.json().catch(() => null);
  const validated = setWeeklyTemplateSchema.safeParse(body);
  if (!validated.success) {
    return c.json(
      { error: "Invalid request body", details: validated.error.issues },
      400,
    );
  }

  try {
    const result = await setWeeklyTemplateDay(
      validated.data.weekday,
      validated.data.taskIds,
      admin.id,
    );

    setAuditMeta(c, {
      weekday: result.weekday,
      taskIds: result.taskIds,
      cleared: result.taskIds.length === 0,
    });

    return c.json(result, 200);
  } catch (error) {
    if (error instanceof DailySelectionError) {
      return c.json({ error: error.message }, 400);
    }
    console.error("AdminTasks.Controllers.setWeeklyTaskTemplate.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
