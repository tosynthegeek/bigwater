import { type Context } from "hono";
import { createtask } from "@/services/tasks";
import { db } from "@/db";
import { tasks } from "@/db/schema/bigwater";
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

export async function deleteTask(c: Context) {
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

    const [deletedTask] = await db
      .delete(tasks)
      .where(eq(tasks.id, taskId))
      .returning();

    return c.json({ task: deletedTask });
  } catch (error) {
    console.error("AdminTasks.Controllers.deleteTaskController.error: ", error);

    return c.json({ error: "Internal server error" }, 500);
  }
}
