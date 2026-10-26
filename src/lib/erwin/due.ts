/**
 * When a task is due, read the same way everywhere: Focus's ranking, the
 * countdowns, the briefing, the scheduler and the counts in the top bar.
 *
 * A due date picked without a time names a calendar day, and the task is due
 * by the end of that day where the person is. The core's own sources store
 * one at midnight: the task form and the sheet at UTC midnight, ops at local
 * midnight. Read as a moment, a task due Wednesday would turn overdue at 8 PM
 * on Tuesday in New York. A module's task (Canvas, a workout) always carries
 * a real moment, even one that lands on midnight, and is taken as it is.
 *
 * Pure, and safe in the browser.
 */
import {
  dayIn,
  endOfDayIn,
  formatInTimeZone,
  localDay,
} from "@/lib/date-utils";

import { moduleForSource } from "@/modules";

/**
 * The calendar day ("2026-10-28") a due date names when it carries no time,
 * or null when it's a real moment.
 */
export function dateOnlyDay(
  due: Date,
  source: string | null | undefined,
  timeZone: string
): string | null {
  if (moduleForSource(source)) return null;
  if (
    due.getUTCHours() === 0 &&
    due.getUTCMinutes() === 0 &&
    due.getUTCSeconds() === 0 &&
    due.getUTCMilliseconds() === 0
  ) {
    return due.toISOString().slice(0, 10);
  }
  if (formatInTimeZone(due, timeZone, "HH:mm:ss.SSS") === "00:00:00.000") {
    return dayIn(due, timeZone);
  }
  return null;
}

/** The moment a task is due by: the end of its day, for a date with no time. */
export function dueBy(
  due: Date,
  source: string | null | undefined,
  timeZone: string
): Date {
  const day = dateOnlyDay(due, source, timeZone);
  return day ? endOfDayIn(day, timeZone) : due;
}

/** The calendar day a task is due, "2026-10-28", where the person is. */
export function dueDay(
  due: Date,
  source: string | null | undefined,
  timeZone: string
): string {
  return dateOnlyDay(due, source, timeZone) ?? dayIn(due, timeZone);
}

/** This browser's zone, for counting what's due today on the client. */
export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Whether a task is due today, in this browser's zone. */
export function isDueToday(task: {
  dueDate?: Date | string | null;
  source?: string | null;
}): boolean {
  if (!task.dueDate) return false;
  return (
    dueDay(new Date(task.dueDate), task.source, browserTimeZone()) ===
    localDay(new Date())
  );
}
