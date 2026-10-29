import ICAL from "ical.js";

/**
 * Steps one series may take from its DTSTART. Expanding from DTSTART rather
 * than from the window is what keeps the work bounded: a years-old
 * FREQ=SECONDLY rule otherwise walks every second up to the window first.
 * 20,000 steps covers a daily series begun 54 years ago, and ical.js takes a
 * few microseconds a step.
 */
export const MAX_SERIES_STEPS = 20_000;

/**
 * A series' occurrence starts within a window, from ical.js's own recurrence
 * expansion of its VEVENT: in the time zone of its DTSTART (so a weekly 9:00
 * class stays at 9:00 across a daylight-saving change), without its EXDATEs
 * and with its RDATEs. rrule anchored on a UTC instant gets all three wrong.
 *
 * Every step from DTSTART counts, against `MAX_SERIES_STEPS` and, when given,
 * against `budget`, the steps left for a whole feed. Returns null when either
 * runs out before the window ends.
 */
export function seriesOccurrences(
  source: ICAL.Component,
  windowStart: Date,
  windowEnd: Date,
  options: { maxInstances: number; budget?: { steps: number } }
): Date[] | null {
  const iterator = new ICAL.Event(source).iterator();
  const found: Date[] = [];
  let steps = 0;
  for (let next = iterator.next(); next; next = iterator.next()) {
    steps += 1;
    if (options.budget) options.budget.steps -= 1;
    if (steps > MAX_SERIES_STEPS || (options.budget && options.budget.steps < 0)) {
      return null;
    }
    const start = next.toJSDate();
    if (start > windowEnd) break;
    if (start < windowStart) continue;
    found.push(start);
    if (found.length >= options.maxInstances) break;
  }
  return found;
}
