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
  // Defaults to true (notify on any real change). Pass false when
  // resubmitting a quick correction you don't want re-announced.
  notify: z.boolean().optional(),
});

// Dated schedule. An empty taskIds array clears the schedule for that date.
export const setTaskScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  taskIds: z
    .array(z.string().min(1))
    .max(MAX_DAILY_TASKS, `Cannot select more than ${MAX_DAILY_TASKS} tasks`),
});
