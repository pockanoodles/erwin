/** How the Ladder prints XP and calendar days (YYYY-MM-DD, already in the user's zone). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** XP without noise: whole stays whole ("23"), a split keeps one decimal ("0.5"). */
export function fmtXp(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** "Oct 24", or "Nov 30, 2027" when it isn't the year of `today`. */
export function shortDay(day: string, today?: string): string {
  const short = `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
  return today && today.slice(0, 4) !== day.slice(0, 4) ? `${short}, ${day.slice(0, 4)}` : short;
}

export function monthOf(day: string): string {
  return MONTHS[Number(day.slice(5, 7)) - 1];
}

const dayTime = (day: string) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

export function daysBetween(from: string, to: string): number {
  return Math.round((dayTime(to) - dayTime(from)) / 86_400_000);
}

/** Monday is 1, Sunday 0, as Date counts them. */
export function weekdayOf(day: string): number {
  return new Date(dayTime(day)).getUTCDay();
}

/** "today", "tomorrow", "in 10 days", "3 days ago" */
export function countdown(today: string, day: string): string {
  const days = daysBetween(today, day);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
