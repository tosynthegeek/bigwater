import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema/rail2";
import { taskQueue } from "./queues/tasks.queue";

export type ActiveTask = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  basePoints: number;
  isHighValue: boolean;
};

export type CreateTaskParams = {
  title: string;
  description?: string;
  category: string;
  basePoints: number;
  isHighValue?: boolean;
  active?: boolean;
};

export async function getActiveTasks(): Promise<ActiveTask[]> {
  return db.query.tasks.findMany({
    where: eq(tasks.active, true),
    orderBy: desc(tasks.createdAt),
  });
}

export async function getTaskById(taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) {
    throw new Error(`Task with id ${taskId} not found`);
  }
  return task;
}

export async function createtask(params: CreateTaskParams) {
  const [task] = await db
    .insert(tasks)
    .values({
      title: params.title,
      description: params.description ?? null,
      category: params.category,
      basePoints: params.basePoints,
      isHighValue: params.isHighValue ?? false,
      active: params.active ?? true,
    })
    .returning();

  if (!task) {
    throw new Error("Failed to create task");
  }

  taskQueue.add("task-notification", {
    taskTitle: task.title,
    taskDescription: task.description,
  });

  return task;
}
