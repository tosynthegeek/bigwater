import z from "zod";
import { MAX_DAILY_TASKS } from "@/services/tasks";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required."),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required."),
  basePoints: z.number().int().nonnegative(),
  isHighValue: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().min(1).optional(),
  basePoints: z.number().int().min(0).optional(),
  isHighValue: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const setDailyTaskSelectionSchema = z.object({
  taskIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one task")
    .max(MAX_DAILY_TASKS, `Cannot select more than ${MAX_DAILY_TASKS} tasks`),
});
