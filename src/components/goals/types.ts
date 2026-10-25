import { format } from "@/lib/date-utils";

/** Format a date-only value (boss/target dates) without timezone drift:
 *  "2026-08-31T00:00:00.000Z" must render Aug 31 everywhere, not Aug 30. */
export function formatDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return format(new Date(year, month - 1, day), "MMM d");
}
