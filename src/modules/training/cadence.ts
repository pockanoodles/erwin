/**
 * When a routine's next session is due, worked out from its cadence and the
 * last session, and how the page says it. Pure, so the server and the page
 * agree and tests need no database.
 */
import { dayInTimeZone } from "@/lib/date-utils";

const DAY_MS = 86_400_000;

/** How far ahead of its day a workout task shows up, at most. */
const MAX_LEAD_DAYS = 2;

/** The choices the page offers, in days between sessions, most often first. */
export const CADENCE_CHOICES = [1, 2, 7 / 3, 3, 3.5, 7, 14] as const;

/** Cadences are stored as floats (7/3), so two are the same within a hair. */
export const sameCadence = (a: number | null, b: number | null) =>
  a === b || (a != null && b != null && Math.abs(a - b) < 1e-6);

const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-6;

/** "Every day", "Every 3 days", "3× a week", "Every 2 weeks". */
export function cadenceLabel(days: number): string {
  if (whole(days)) {
    const n = Math.round(days);
    if (n === 1) return "Every day";
    if (n % 7 === 0) return n === 7 ? "Every week" : `Every ${n / 7} weeks`;
    return `Every ${n} days`;
  }
  const perWeek = 7 / days;
  if (whole(perWeek)) return `${Math.round(perWeek)}× a week`;
  return `Every ${days.toFixed(1)} days`;
}

export interface CadenceRoutine {
  name: string;
  cadenceDays: number | null;
  minutes: number;
  lastDoneAt: Date | null;
  createdAt: Date;
  archived: boolean;
}

/** When the next session is due, or null with no schedule (or archived). */
export function nextSession(routine: CadenceRoutine): Date | null {
  if (routine.archived || !routine.cadenceDays || routine.cadenceDays <= 0) {
    return null;
  }
  const from = routine.lastDoneAt ?? routine.createdAt;
  return new Date(from.getTime() + routine.cadenceDays * DAY_MS);
}

export interface WorkoutPlan {
  title: string;
  description: string;
  /** The day it's due, as task dates are stored: UTC midnight. */
  dueDate: Date;
  /** Hidden until then (Task.postponedUntil), or null to show it now. */
  postponedUntil: Date | null;
  duration: number;
}

/**
 * The workout task a routine should have right now, or null for none. It's
 * due on the day the next session falls on in the person's time zone, and
 * stays hidden until shortly before (a quarter of the cadence, two days at
 * most), so it isn't in every list the moment the last one is done. `lines`
 * are what to do, as the description lists them.
 */
export function planWorkout(
  routine: CadenceRoutine,
  lines: string[],
  now: Date,
  timeZone: string
): WorkoutPlan | null {
  const next = nextSession(routine);
  if (!next || !routine.cadenceDays) return null;
  const due = dayInTimeZone(next, timeZone);
  const leadDays = Math.min(MAX_LEAD_DAYS, routine.cadenceDays / 4);
  const showAt = new Date(due.getTime() - leadDays * DAY_MS);
  const head = [
    `${cadenceLabel(routine.cadenceDays)}.`,
    routine.lastDoneAt
      ? `Last done ${dayInTimeZone(routine.lastDoneAt, timeZone).toISOString().slice(0, 10)}.`
      : "Not done yet.",
  ].join(" ");
  return {
    title: routine.name,
    description: [head, ...lines].join("\n"),
    dueDate: due,
    postponedUntil: showAt > now ? showAt : null,
    duration: routine.minutes,
  };
}

/** "2026-10-25": a calendar day in the browser's own zone. */
export function localDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Whole calendar days from one day ("2026-10-25") to another. */
export function daysBetween(from: string, to: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** "today", "tomorrow", "in 3 days", "2 days overdue", for a day it's due. */
export function nextLabel(day: string | null, today: string): string {
  if (!day) return "";
  const days = daysBetween(today, day);
  if (days === 0) return "today";
  if (days < 0) return days === -1 ? "1 day overdue" : `${-days} days overdue`;
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  return `in ${Math.round(days / 7)} weeks`;
}

/** "today", "yesterday", "12 days ago", "3 months ago", "never". */
export function lastLabel(at: string | null, today: string): string {
  if (!at) return "never";
  const days = daysBetween(localDay(new Date(at)), today);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}
