/**
 * The Work module's arithmetic, free of the database: how long a shift ran,
 * which pay period and week a day falls in, and what a set of shifts adds up
 * to. Days are "yyyy-MM-dd" strings in the person's own zone.
 */
import { shiftDay } from "@/lib/date-utils";

/** A shift as the sums read it. */
export interface TimedShift {
  start: Date;
  end: Date;
  workedStart: Date | null;
  workedEnd: Date | null;
  dropped: boolean;
}

/** When it ran: as worked where that was changed, else as scheduled. */
export function spanOf(s: TimedShift): { start: Date; end: Date } {
  return { start: s.workedStart ?? s.start, end: s.workedEnd ?? s.end };
}

/** Its length in hours, to the minute. Never negative. */
export function hoursOf(s: TimedShift): number {
  const { start, end } = spanOf(s);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return Math.max(minutes, 0) / 60;
}

/** It has ended and wasn't dropped: its hours count as worked. */
export function isWorked(s: TimedShift, now: Date): boolean {
  return !s.dropped && spanOf(s).end <= now;
}

/** Hours added up, rounded to two places so 0.1 + 0.2 reads as 0.3. */
export function sumHours(shifts: readonly TimedShift[]): number {
  const total = shifts.reduce((sum, s) => sum + hoursOf(s), 0);
  return Math.round(total * 100) / 100;
}

/** Pay for some hours at a rate, to the cent; null without a rate. */
export function earningsFor(hours: number, rate: number | null): number | null {
  return rate === null ? null : Math.round(hours * rate * 100) / 100;
}

/** Whole days from one day to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export interface DayRange {
  first: string;
  last: string;
}

/**
 * The pay period a day falls in, counted every `length` days from any day a
 * period started (`anchor`), forward or back.
 */
export function periodOf(
  day: string,
  anchor: string,
  length: number
): DayRange {
  const offset = daysBetween(anchor, day);
  const first = shiftDay(anchor, Math.floor(offset / length) * length);
  return { first, last: shiftDay(first, length - 1) };
}

const WEEKDAY: Record<string, number> = { sunday: 0, monday: 1 };

/** The week a day falls in, starting on the person's week start ("sunday" or "monday"). */
export function weekOf(day: string, weekStartDay: string): DayRange {
  const start = WEEKDAY[weekStartDay] ?? 0;
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const first = shiftDay(day, -((weekday - start + 7) % 7));
  return { first, last: shiftDay(first, 6) };
}

/** "7.5" or "7": hours as a task title or the brief says them. */
export function formatHours(hours: number): string {
  return Number.isInteger(hours)
    ? String(hours)
    : hours.toFixed(2).replace(/0$/, "");
}
