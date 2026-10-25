/**
 * When someone is due a check-in, worked out from their cadence and the last
 * conversation. Pure, so the server and the page agree and tests need no
 * database.
 */

const DAY_MS = 86_400_000;

/** How far ahead of the due date a reach-out task shows up. */
const MAX_LEAD_DAYS = 3;

export interface CadencePerson {
  name: string;
  org: string | null;
  cadenceDays: number | null;
  lastContactAt: Date | null;
  createdAt: Date;
  archived: boolean;
}

/** When the next check-in is due, or null with no cadence (or archived). */
export function nextCheckIn(person: CadencePerson): Date | null {
  if (person.archived || !person.cadenceDays || person.cadenceDays <= 0) {
    return null;
  }
  const from = person.lastContactAt ?? person.createdAt;
  return new Date(from.getTime() + person.cadenceDays * DAY_MS);
}

export interface ReachOutPlan {
  title: string;
  description: string;
  dueDate: Date;
  /** Hidden until then (Task.postponedUntil), or null to show it now. */
  postponedUntil: Date | null;
}

/**
 * The reach-out task a person should have right now, or null for none. It
 * stays hidden until a few days before it's due (a quarter of the cadence at
 * most), so a long cadence doesn't sit in every list for weeks.
 */
export function planReachOut(
  person: CadencePerson,
  now: Date
): ReachOutPlan | null {
  const due = nextCheckIn(person);
  if (!due || !person.cadenceDays) return null;
  const leadDays = Math.min(MAX_LEAD_DAYS, person.cadenceDays / 4);
  const showAt = new Date(due.getTime() - leadDays * DAY_MS);
  const lines = [
    person.org,
    `Every ${cadenceLabel(person.cadenceDays)}.`,
    person.lastContactAt
      ? `Last talked ${person.lastContactAt.toISOString().slice(0, 10)}.`
      : "No conversation logged yet.",
  ].filter(Boolean);
  return {
    title: `Reach out to ${person.name}`,
    description: lines.join(" "),
    dueDate: due,
    postponedUntil: showAt > now ? showAt : null,
  };
}

/** "week", "2 weeks", "month", "10 days": the cadence as a sentence ends it. */
export function cadenceLabel(days: number): string {
  if (days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "month" : `${months} months`;
  }
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "week" : `${weeks} weeks`;
  }
  return days === 1 ? "day" : `${days} days`;
}

/** The choices the page offers, in days. */
export const CADENCE_CHOICES = [7, 14, 30, 60, 90, 180] as const;

/** "3 days overdue", "today", "in 2 weeks", relative to now. */
export function dueLabel(due: Date | null, now: Date): string {
  if (!due) return "";
  const days = Math.round((due.getTime() - now.getTime()) / DAY_MS);
  if (days === 0) return "today";
  if (days < 0) {
    const n = -days;
    return n === 1 ? "1 day overdue" : `${n} days overdue`;
  }
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/** "today", "yesterday", "12 days ago", "3 months ago". */
export function agoLabel(at: Date | null, now: Date): string {
  if (!at) return "never";
  const days = Math.floor((now.getTime() - at.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}
