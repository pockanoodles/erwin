import ICAL from "ical.js";
import { RRule } from "rrule";

/**
 * Frequencies finer than a day. Google, Outlook and Apple Calendar can't make
 * them, and a series that has one is not expanded (its master row stays): its
 * only effect would be making a sync enumerate millions of occurrences.
 */
const REFUSED_FREQUENCIES = new Set(["SECONDLY", "MINUTELY", "HOURLY"]);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Gregorian calendar repeats exactly every 400 years, weekdays and leap
 * days included. rrule checks UNTIL only on a date that passes the rule's
 * filters, so a rule that never matches (the 30th of February) searches day
 * by day until the year 9999. Moving the whole computation forward by a
 * multiple of 400 years puts the window just under 9999, so that search ends
 * within 400 years of it: a few hundred milliseconds instead of seconds.
 */
const CYCLE_YEARS = 400;
const RRULE_MAX_YEAR = 9999;

/** A series begun this long before the window is not expanded. */
const MAX_YEARS_BEFORE_WINDOW = 400;

/**
 * BYHOUR x BYMINUTE x BYSECOND gives each matching day that many times. A
 * daily rule listing every hour, minute and second is one occurrence a second.
 * More than 24 a day is refused.
 */
const MAX_TIMES_A_DAY = 24;

/**
 * Days times the times-a-day rrule walks before the window: about a second of
 * work. A series that needs more keeps its master only.
 */
const MAX_WORK_BEFORE_WINDOW = 2_000_000;

const sizeOf = (values: number | number[] | null | undefined) =>
  Array.isArray(values) ? Math.max(values.length, 1) : 1;

function shiftYears(date: Date, years: number): Date {
  const shifted = new Date(date.getTime());
  shifted.setUTCFullYear(date.getUTCFullYear() + years);
  return shifted;
}

/**
 * An ICAL.Time's wall-clock fields as a "floating" Date, one whose UTC fields
 * read as that wall clock. rrule does its arithmetic in UTC, which has no
 * daylight saving, so a rule run on floating dates repeats the wall-clock time.
 */
function floating(time: ICAL.Time): Date {
  return new Date(
    Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second)
  );
}

/** A floating Date back to the instant its wall clock names in `like`'s zone. */
function instant(wall: Date, like: ICAL.Time): Date {
  return new ICAL.Time(
    {
      year: wall.getUTCFullYear(),
      month: wall.getUTCMonth() + 1,
      day: wall.getUTCDate(),
      hour: wall.getUTCHours(),
      minute: wall.getUTCMinutes(),
      second: wall.getUTCSeconds(),
      isDate: like.isDate,
    },
    like.zone
  ).toJSDate();
}

/** The instants of a VEVENT's EXDATE or RDATE lines (a period counts by its start). */
function dateList(vevent: ICAL.Component, name: "exdate" | "rdate"): Date[] {
  const dates: Date[] = [];
  for (const property of vevent.getAllProperties(name)) {
    for (const value of property.getValues()) {
      try {
        const time =
          value && typeof (value as ICAL.Time).toJSDate === "function"
            ? (value as ICAL.Time)
            : (value as ICAL.Period).start;
        const date = time?.toJSDate();
        if (date && !Number.isNaN(date.getTime())) dates.push(date);
      } catch {
        // One unreadable value doesn't cost the series its other dates.
      }
    }
  }
  return dates;
}

/**
 * A series' occurrence starts within a window, from its VEVENT: in the time
 * zone of its DTSTART, so a weekly 9:00 class stays at 9:00 across a
 * daylight-saving change, without its EXDATEs and with its RDATEs.
 *
 * rrule repeats the DTSTART's wall-clock time (see `floating`), and each
 * occurrence goes back to an instant through the feed's own VTIMEZONE, which
 * also covers the Windows zone names Outlook writes. ical.js's own recurrence
 * iterator is not used: it loops forever on a rule that never matches and
 * crashes on a period-valued RDATE.
 *
 * Returns null, and the series keeps its master only, for a rule finer than
 * daily, one with more than 24 times a day, or one whose walk from DTSTART to
 * the window is too long. Otherwise the work is that walk, the window itself
 * (stopped at `maxInstances`), and at most 400 years past it for a rule that
 * never matches (see CYCLE_YEARS).
 */
export function seriesOccurrences(
  vevent: ICAL.Component,
  windowStart: Date,
  windowEnd: Date,
  maxInstances: number
): Date[] | null {
  const recur = vevent.getFirstPropertyValue("rrule") as ICAL.Recur | null;
  const dtstart = vevent.getFirstPropertyValue("dtstart") as ICAL.Time | null;
  if (!recur || !dtstart || typeof dtstart.toJSDate !== "function") return [];
  if (REFUSED_FREQUENCIES.has(String(recur.freq).toUpperCase())) return null;

  const start = floating(dtstart);
  const horizon = new Date(windowEnd.getTime() + DAY_MS);
  const yearsBefore = windowStart.getUTCFullYear() - start.getUTCFullYear();
  if (yearsBefore > MAX_YEARS_BEFORE_WINDOW) return null;
  const shift =
    CYCLE_YEARS *
    Math.floor((RRULE_MAX_YEAR - horizon.getUTCFullYear()) / CYCLE_YEARS);

  const options = RRule.parseString(recur.toString());
  const timesADay =
    sizeOf(options.byhour) * sizeOf(options.byminute) * sizeOf(options.bysecond);
  if (timesADay > MAX_TIMES_A_DAY) return null;
  if (Math.max(yearsBefore, 0) * 366 * timesADay > MAX_WORK_BEFORE_WINDOW) return null;
  options.dtstart = shiftYears(start, shift);
  options.tzid = null;
  // UNTIL is an instant; in floating terms it's that instant's wall clock in
  // the series' zone. Either way the rule stops a day past the window.
  const until = recur.until
    ? floating(recur.until.clone().convertToZone(dtstart.zone))
    : null;
  options.until = shiftYears(until && until < horizon ? until : horizon, shift);

  // The window in floating terms is off by at most a day of UTC offset, so a
  // day each side, then the exact window once each occurrence is an instant.
  // The callback stops generation once the window holds enough, counting only
  // occurrences that stay: inside the window and not removed by an EXDATE.
  // Without it, between() collects every occurrence before returning any.
  const excluded = new Set(dateList(vevent, "exdate").map((d) => d.getTime()));
  const starts = new Map<number, Date>();
  const keep = (date: Date) => {
    const ms = date.getTime();
    if (date < windowStart || date > windowEnd || excluded.has(ms)) return;
    starts.set(ms, date);
  };
  new RRule(options).between(
    shiftYears(new Date(windowStart.getTime() - DAY_MS), shift),
    shiftYears(horizon, shift),
    true,
    (wall) => {
      keep(instant(shiftYears(wall, -shift), dtstart));
      return starts.size < maxInstances;
    }
  );
  for (const date of dateList(vevent, "rdate")) keep(date);

  return [...starts.values()]
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, maxInstances);
}
