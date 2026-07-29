import { type Context } from "hono";
import { createtask } from "@/services/tasks";
import { db } from "@/db";
import { tasks } from "@/db/schema/rail2";
import { createTaskSchema, updateTaskSchema } from "@/zod/task";
import { eq } from "drizzle-orm";

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
