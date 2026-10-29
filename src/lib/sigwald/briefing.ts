/**
 * Daily briefing stats and DANGER detection (Stage 1, spec §5.2.2).
 */
import { dayIn, endOfDayIn, shiftDay, startOfDayIn } from "@/lib/date-utils";
import type { TaskForRanking } from "@/lib/sigwald/rank-stage1";
import { isDangerResolved } from "@/lib/sigwald/rank-stage1";

export interface FocusBriefing {
  /** Today in the person's zone, "2026-10-28". */
  dateLabel: string;
  dueTodayCount: number;
  dueThisWeekCount: number;
  dangerCount: number;
  pendingCount: number;
  /** Minutes Sigwald estimates as free in the current/next slot during work hours (optional) */
  effectiveCapacityMinutes?: number | null;
  /** Human-readable current slot line from the availability engine */
  slotNarrative?: string | null;
}

/**
 * Computes briefing numbers from already-filtered candidate tasks (non-completed, etc.).
 */
export function computeFocusBriefing(
  candidates: TaskForRanking[],
  now: Date,
  timeZone: string
): FocusBriefing {
  // Due dates here are already the moments tasks are due by (toTaskForRanking).
  const today = dayIn(now, timeZone);
  const dueTodayCount = candidates.filter(
    (t) => t.dueDate && dayIn(new Date(t.dueDate), timeZone) === today
  ).length;

  const weekStart = startOfDayIn(today, timeZone);
  const weekEnd = endOfDayIn(shiftDay(today, 7), timeZone);
  const dueThisWeekCount = candidates.filter(
    (t) =>
      t.dueDate &&
      new Date(t.dueDate) >= weekStart &&
      new Date(t.dueDate) <= weekEnd
  ).length;

  const dangerCount = candidates.filter((t) => isDangerResolved(t, now)).length;

  return {
    dateLabel: today,
    dueTodayCount,
    dueThisWeekCount,
    dangerCount,
    pendingCount: candidates.length,
  };
}
