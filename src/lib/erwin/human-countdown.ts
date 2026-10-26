/**
 * Human-readable due countdown for Focus UI (docs/focus-mode.md §2.4).
 */
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  formatInTimeZone,
  newDate,
} from "@/lib/date-utils";

/**
 * Relative countdown / due label for the task card and briefing lists. Day
 * names are the person's (`timeZone`), not the server's.
 */
export function humanCountdown(
  dueAt: Date,
  from: Date = newDate(),
  timeZone: string
): string {
  const due = dueAt instanceof Date ? dueAt : newDate(dueAt);
  const minutesLeft = differenceInMinutes(due, from);
  const hoursLeft = differenceInHours(due, from);

  if (minutesLeft < 0) {
    return "OVERDUE";
  }
  if (minutesLeft < 60) {
    return `${minutesLeft}m left`;
  }
  if (hoursLeft < 24) {
    return `${hoursLeft}h left`;
  }
  if (hoursLeft < 48) {
    return "Due tomorrow";
  }

  const daysLeft = differenceInDays(due, from);
  if (daysLeft < 7) {
    return `Due ${formatInTimeZone(due, timeZone, "EEEE")}`;
  }

  return `Due ${formatInTimeZone(due, timeZone, "MMM d")}`;
}
