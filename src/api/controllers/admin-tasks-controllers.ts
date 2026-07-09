import { type Context } from "hono";
import { createTask } from "@/services/tasks";
import { createTaskSchema } from "@/zod/task";

export async function createTaskController(c: Context) {
  const body = await c.req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request body", details: parsed.error },
      400,
    );
  }

  const task = await createTask(parsed.data);
  return c.json({ task }, 201);
}
