import { type Context } from "hono";
import { getActiveTasks } from "@/services/tasks";

export async function listActiveTasks(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  try {
    const tasks = await getActiveTasks();
    return c.json({ tasks }, 200);
  } catch (error) {
    console.error("Tasks.Controllers.listActiveTasks.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
