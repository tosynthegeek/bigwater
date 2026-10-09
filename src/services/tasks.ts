// src/services/tasks.ts
import { and, eq, gt, inArray, lte, max } from "drizzle-orm";
import { db } from "@/db";
import {
  dailyTaskSelections,
  scheduledTaskSelections,
  tasks,
} from "@/db/schema/rail2";
import { taskQueue } from "./queues/tasks.queue";
import { periodIndex, timeframes } from "@/services/economy/config";

export const MAX_DAILY_TASKS = 5;

export class DailySelectionError extends Error {}

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

// ---------------------------------------------------------------------------
// Day index <-> calendar date.
//
// dayIndexForDate goes through periodIndex, so it always agrees with the rest
// of the codebase. dateForDayIndex is its inverse: with the default config
// (dayPeriodMs = 24h, epoch-aligned, so days start at 00:00 UTC) it returns
// the UTC calendar date of the day; with a DAY_PERIOD_MS override it returns
// the date of that day's start instant.
// ---------------------------------------------------------------------------
export function dateForDayIndex(dayIndex: number): string {
  return new Date(dayIndex * timeframes.dayPeriodMs).toISOString().slice(0, 10);
}

export function dayIndexForDate(date: string): number {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 10) !== date
  ) {
    throw new DailySelectionError("Invalid date, expected YYYY-MM-DD");
  }
  return periodIndex(d, timeframes.dayPeriodMs);
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
 * The most recent day (<= `today`) that has a selection row, or null if the
 * admin has never made a pick. This is what makes a selection persist across
 * any number of days until the admin sets a new one.
 */
async function latestSelectionDayIndex(
  today: number,
  conn: DbLike = db,
): Promise<number | null> {
  const [row] = await conn
    .select({ dayIndex: max(dailyTaskSelections.dayIndex) })
    .from(dailyTaskSelections)
    .where(lte(dailyTaskSelections.dayIndex, today));
  return row?.dayIndex ?? null;
}

/**
 * Today's selected tasks. If the admin hasn't picked today's yet, carries
 * forward the most recent selection (however many days back) — tasks stay
 * live until the admin sets a new selection. Returns [] only if a selection
 * has never been made.
 *
 * A dated schedule reaches this path by being materialized into
 * dailyTaskSelections (see materializeDay); until that runs for a new day,
 * this shows the previous selection.
 */
export async function getActiveTasks(
  at: Date = new Date(),
): Promise<ActiveTask[]> {
  const latest = await latestSelectionDayIndex(currentDayIndex(at));
  if (latest === null) return [];
  return selectionForDay(latest);
}

/**
 * Which task IDs currently count as "available to submit to" — today's
 * selection, or the most recent one carried forward. Used to validate a
 * submission's taskId server-side rather than trusting that the client only
 * shows what getActiveTasks() returned.
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
  const latest = await latestSelectionDayIndex(today);
  if (latest === null) {
    return { dayIndex: today, isToday: false, tasks: [] as ActiveTask[] };
  }
  return {
    dayIndex: latest,
    isToday: latest === today,
    tasks: await selectionForDay(latest),
  };
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

export function formatDailyTasksAnnouncement(tasks: ActiveTask[]): string {
  const lines = tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.title} (+${t.basePoints} pts)${t.isHighValue ? " ⭐" : ""}`,
    )
    .join("\n");
  return `📋 Today's tasks are live!\n\n${lines}\n\nOpen /tasks to get started.`;
}

/** Sync checks: size cap and duplicates. Returns the de-duplicated list. */
function normalizeTaskIds(taskIds: string[]): string[] {
  if (taskIds.length > MAX_DAILY_TASKS) {
    throw new DailySelectionError(
      `Cannot select more than ${MAX_DAILY_TASKS} tasks`,
    );
  }

  const uniqueIds = Array.from(new Set(taskIds));
  if (uniqueIds.length !== taskIds.length) {
    throw new DailySelectionError("Duplicate task IDs in selection");
  }
  return uniqueIds;
}

/** DB checks: every ID exists and is active. No-op for an empty list. */
async function assertTasksSelectable(
  uniqueIds: string[],
  conn: DbLike,
): Promise<void> {
  if (uniqueIds.length === 0) return;

  const found = await conn
    .select()
    .from(tasks)
    .where(inArray(tasks.id, uniqueIds));

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
}

/**
 * Replace today's task selection wholesale (delete + insert in one tx, so a
 * crash mid-write never leaves a partial day). Rejects unknown or inactive
 * task IDs, duplicates, and more than MAX_DAILY_TASKS.
 *
 * `changed` tells the caller whether the *set* of selected tasks actually
 * differs from what was there before (order-insensitive) — use it to avoid
 * re-notifying participants on a no-op resubmit or a pure reorder.
 */
export async function setDailyTaskSelection(
  taskIds: string[],
  selectedBy: string,
  at: Date = new Date(),
): Promise<{ tasks: ActiveTask[]; changed: boolean }> {
  if (taskIds.length === 0) {
    throw new DailySelectionError("Must select at least one task");
  }
  const uniqueIds = normalizeTaskIds(taskIds);

  const dayIndex = currentDayIndex(at);

  return db.transaction(async (tx) => {
    await assertTasksSelectable(uniqueIds, tx);

    const existingRows = await tx
      .select({ taskId: dailyTaskSelections.taskId })
      .from(dailyTaskSelections)
      .where(eq(dailyTaskSelections.dayIndex, dayIndex));
    const existingIds = new Set(existingRows.map((r) => r.taskId));
    const newIds = new Set(uniqueIds);
    const changed =
      existingIds.size !== newIds.size ||
      uniqueIds.some((id) => !existingIds.has(id));

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

    const selected = await selectionForDay(dayIndex, tx);
    return { tasks: selected, changed };
  });
}

export type ScheduledTask = ActiveTask & { active: boolean };

/**
 * Set (replace) the schedule for a future date. An empty `taskIds` clears the
 * schedule for that date. Today and past dates are rejected: today's set is
 * managed through setDailyTaskSelection.
 */
export async function setScheduledSelection(
  date: string,
  taskIds: string[],
  createdBy: string,
  at: Date = new Date(),
): Promise<{ date: string; dayIndex: number; taskIds: string[] }> {
  const dayIndex = dayIndexForDate(date);
  if (dayIndex <= currentDayIndex(at)) {
    throw new DailySelectionError(
      "Schedule date must be after today; use the daily selection for today",
    );
  }
  const uniqueIds = normalizeTaskIds(taskIds);

  await db.transaction(async (tx) => {
    await assertTasksSelectable(uniqueIds, tx);

    await tx
      .delete(scheduledTaskSelections)
      .where(eq(scheduledTaskSelections.dayIndex, dayIndex));

    if (uniqueIds.length > 0) {
      await tx.insert(scheduledTaskSelections).values(
        uniqueIds.map((taskId, i) => ({
          dayIndex,
          taskId,
          order: i,
          createdBy,
        })),
      );
    }
  });

  return { date, dayIndex, taskIds: uniqueIds };
}

/** Upcoming dated schedules (after today), soonest first. */
export async function listScheduledSelections(at: Date = new Date()) {
  const today = currentDayIndex(at);
  const rows = await db
    .select({
      dayIndex: scheduledTaskSelections.dayIndex,
      order: scheduledTaskSelections.order,
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      category: tasks.category,
      basePoints: tasks.basePoints,
      isHighValue: tasks.isHighValue,
      active: tasks.active,
    })
    .from(scheduledTaskSelections)
    .innerJoin(tasks, eq(scheduledTaskSelections.taskId, tasks.id))
    .where(gt(scheduledTaskSelections.dayIndex, today))
    .orderBy(scheduledTaskSelections.dayIndex, scheduledTaskSelections.order);

  const byDay = new Map<number, ScheduledTask[]>();
  for (const { dayIndex, order, ...task } of rows) {
    const list = byDay.get(dayIndex) ?? [];
    list.push(task);
    byDay.set(dayIndex, list);
  }

  return Array.from(byDay, ([dayIndex, dayTasks]) => ({
    dayIndex,
    date: dateForDayIndex(dayIndex),
    tasks: dayTasks,
  }));
}

// ---------------------------------------------------------------------------
// Materialization: turn a dated schedule into today's real selection.
// ---------------------------------------------------------------------------

/**
 * If today has no selection rows yet, build one from the dated schedule for
 * today and insert it into dailyTaskSelections. Inactive tasks are skipped.
 * Does nothing if today already has rows (manual picks always win) or if the
 * schedule has no active tasks for today (carry-forward then applies).
 *
 * Idempotent: safe to run repeatedly or concurrently — the
 * (dayIndex, taskId) unique constraint plus onConflictDoNothing means a second
 * run inserts nothing and reports created: false.
 */
export async function materializeDay(at: Date = new Date()): Promise<{
  dayIndex: number;
  created: boolean;
  source: "scheduled" | null;
}> {
  const dayIndex = currentDayIndex(at);

  const [existing] = await db
    .select({ id: dailyTaskSelections.id })
    .from(dailyTaskSelections)
    .where(eq(dailyTaskSelections.dayIndex, dayIndex))
    .limit(1);
  if (existing) return { dayIndex, created: false, source: null };

  return db.transaction(async (tx) => {
    const picks = await tx
      .select({ taskId: scheduledTaskSelections.taskId })
      .from(scheduledTaskSelections)
      .innerJoin(tasks, eq(scheduledTaskSelections.taskId, tasks.id))
      .where(
        and(
          eq(scheduledTaskSelections.dayIndex, dayIndex),
          eq(tasks.active, true),
        ),
      )
      .orderBy(scheduledTaskSelections.order);

    if (picks.length === 0) return { dayIndex, created: false, source: null };

    const inserted = await tx
      .insert(dailyTaskSelections)
      .values(
        picks.map((p, i) => ({
          dayIndex,
          taskId: p.taskId,
          order: i,
          selectedBy: null,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: dailyTaskSelections.id });

    return {
      dayIndex,
      created: inserted.length > 0,
      source: "scheduled" as const,
    };
  });
}

/**
 * Entry point for the day-start job (and a startup catch-up run). Returns null
 * when nothing was materialized (manual pick already present, nothing
 * scheduled, or already ran); otherwise the new selection plus the Telegram
 * announcement text, so the caller decides whether and how to broadcast.
 */
export async function runDailyRollover(at: Date = new Date()) {
  const result = await materializeDay(at);
  if (!result.created) return null;

  const todays = await selectionForDay(result.dayIndex);
  if (todays.length === 0) return null;

  return {
    source: result.source,
    tasks: todays,
    message: formatDailyTasksAnnouncement(todays),
  };
}
