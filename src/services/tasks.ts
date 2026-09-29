// src/services/tasks.ts
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { dailyTaskSelections, tasks } from "@/db/schema/rail2";
import { taskQueue } from "./queues/tasks.queue";
import { periodIndex, timeframes } from "@/services/economy/config";

export const MAX_DAILY_TASKS = 5;

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

// The same day boundary submission-limits.ts uses for cooldowns and daily
// submission counts, so "today's 5 tasks" and "today's submission window"
// always agree on where a day starts.
export function currentDayIndex(at: Date = new Date()): number {
  return periodIndex(at, timeframes.dayPeriodMs);
}

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function selectionForDay(
  dayIndex: number,
  conn: DbLike = db,
): Promise<ActiveTask[]> {
  const rows = await conn
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      category: tasks.category,
      basePoints: tasks.basePoints,
      isHighValue: tasks.isHighValue,
      order: dailyTaskSelections.order,
    })
    .from(dailyTaskSelections)
    .innerJoin(tasks, eq(dailyTaskSelections.taskId, tasks.id))
    // A task deactivated after being selected (deactivateTask) drops out of
    // the live list without needing to touch the day's selection rows.
    .where(
      and(eq(dailyTaskSelections.dayIndex, dayIndex), eq(tasks.active, true)),
    )
    .orderBy(dailyTaskSelections.order);

  return rows.map(({ order, ...task }) => task);
}

/**
 * Today's selected tasks. Falls back to yesterday's selection if the admin
 * hasn't picked today's yet — so there's a gap between midnight and whenever
 * the admin makes their pick, not an empty list. Returns [] only if neither
 * day has a selection (e.g. before the first pick is ever made).
 */
export async function getActiveTasks(
  at: Date = new Date(),
): Promise<ActiveTask[]> {
  const today = currentDayIndex(at);
  const todays = await selectionForDay(today);
  if (todays.length > 0) return todays;
  return selectionForDay(today - 1);
}

/**
 * Which task IDs currently count as "available to submit to" — today's
 * selection, or yesterday's as fallback. Used to validate a submission's
 * taskId server-side rather than trusting that the client only shows what
 * getActiveTasks() returned.
 */
export async function getActiveTaskIds(
  at: Date = new Date(),
): Promise<Set<string>> {
  const active = await getActiveTasks(at);
  return new Set(active.map((t) => t.id));
}

/** Effective selection info for the admin UI: which day it's actually showing. */
export async function getDailySelectionStatus(at: Date = new Date()) {
  const today = currentDayIndex(at);
  const todays = await selectionForDay(today);
  if (todays.length > 0) {
    return { dayIndex: today, isToday: true, tasks: todays };
  }
  const yesterdays = await selectionForDay(today - 1);
  return { dayIndex: today - 1, isToday: false, tasks: yesterdays };
}

export async function getTaskById(taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

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

export class DailySelectionError extends Error {}

/**
 * Replace today's task selection wholesale (delete + insert in one tx, so a
 * crash mid-write never leaves a partial day). Rejects unknown or inactive
 * task IDs, duplicates, and more than MAX_DAILY_TASKS.
 */
export async function setDailyTaskSelection(
  taskIds: string[],
  selectedBy: string,
  at: Date = new Date(),
): Promise<ActiveTask[]> {
  if (taskIds.length === 0) {
    throw new DailySelectionError("Must select at least one task");
  }
  if (taskIds.length > MAX_DAILY_TASKS) {
    throw new DailySelectionError(
      `Cannot select more than ${MAX_DAILY_TASKS} tasks`,
    );
  }

  const uniqueIds = Array.from(new Set(taskIds));
  if (uniqueIds.length !== taskIds.length) {
    throw new DailySelectionError("Duplicate task IDs in selection");
  }

  const dayIndex = currentDayIndex(at);

  return db.transaction(async (tx) => {
    const found = await tx.query.tasks.findMany({
      where: inArray(tasks.id, uniqueIds),
    });

    if (found.length !== uniqueIds.length) {
      const foundIds = new Set(found.map((t) => t.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      throw new DailySelectionError(`Unknown task IDs: ${missing.join(", ")}`);
    }

    const inactive = found.filter((t) => !t.active);
    if (inactive.length > 0) {
      throw new DailySelectionError(
        `Cannot select inactive tasks: ${inactive.map((t) => t.title).join(", ")}`,
      );
    }

    await tx
      .delete(dailyTaskSelections)
      .where(eq(dailyTaskSelections.dayIndex, dayIndex));

    await tx.insert(dailyTaskSelections).values(
      uniqueIds.map((taskId, i) => ({
        dayIndex,
        taskId,
        order: i,
        selectedBy,
      })),
    );

    return selectionForDay(dayIndex, tx);
  });
}
