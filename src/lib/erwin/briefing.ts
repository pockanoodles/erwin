/**
 * Daily briefing stats and DANGER detection (Stage 1, spec §5.2.2).
 */

import { startOfDay } from "@/lib/date-utils";

import type { TaskForRanking } from "@/lib/erwin/rank-stage1";
import { isDangerResolved } from "@/lib/erwin/rank-stage1";

export interface FocusBriefing {
  /** ISO date label for the briefing (UTC calendar day) */
  dateLabel: string;
  dueTodayCount: number;
  dueThisWeekCount: number;
  dangerCount: number;
  pendingCount: number;
  /** Minutes Erwin estimates as free in the current/next slot during work hours (optional) */
  effectiveCapacityMinutes?: number | null;
  /** Human-readable current slot line from the availability engine */
  slotNarrative?: string | null;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Computes briefing numbers from already-filtered candidate tasks (non-completed, etc.).
 */
export function computeFocusBriefing(
  candidates: TaskForRanking[],
  now: Date
): FocusBriefing {
  const dueTodayCount = candidates.filter(
    (t) => t.dueDate && isSameUtcDay(new Date(t.dueDate), now)
  ).length;

  const horizon = new Date(startOfDay(now));
  horizon.setUTCDate(horizon.getUTCDate() + 7);
  const dueThisWeekCount = candidates.filter(
    (t) =>
      t.dueDate &&
      new Date(t.dueDate) >= startOfDay(now) &&
      new Date(t.dueDate) <= horizon
  ).length;

  const dangerCount = candidates.filter((t) => isDangerResolved(t, now)).length;

  return {
    dateLabel: now.toISOString().slice(0, 10),
    dueTodayCount,
    dueThisWeekCount,
    dangerCount,
    pendingCount: candidates.length,
  };
}
