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

// Scheduled selection. An empty taskIds array clears the schedule for that
// day. Exactly one target must be given:
//   - date:      "YYYY-MM-DD" (real 24h days; the service rejects it when
//                DAY_PERIOD_MS is overridden)
//   - dayOffset: periods from the current one (1 = next period)
//   - dayIndex:  absolute day index
// Environment-dependent rules (is `date` allowed? is the target in the
// future?) are enforced in the service, not here.
export const setTaskScheduleSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
    dayOffset: z.number().int().min(1).optional(),
    dayIndex: z.number().int().nonnegative().optional(),
    taskIds: z
      .array(z.string().min(1))
      .max(MAX_DAILY_TASKS, `Cannot select more than ${MAX_DAILY_TASKS} tasks`),
  })
  .refine(
    (v) =>
      [v.date, v.dayOffset, v.dayIndex].filter((x) => x !== undefined)
        .length === 1,
    { message: "Provide exactly one of: date, dayOffset, dayIndex" },
  );
