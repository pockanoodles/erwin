import { toZonedTime } from "date-fns-tz";

import { TimeFormat } from "@/types/settings";

/**
 * FullCalendar's sentinel for "render in the browser's local time zone". When
 * the calendar is configured with this (its current setting), the browser zone
 * already governs the displayed time, so no conversion is needed.
 */
const LOCAL_TIME_ZONE = "local";

/**
 * Day-grid views (month, multi-month) render events as compact chips inside a
 * day cell. Time-grid views (day, week) already lay events out on a time axis
 * and color the event block, so the month-style "time + colored dot" treatment
 * only applies to day-grid views.
 */
export function isDayGridView(viewType: string): boolean {
  return viewType.startsWith("dayGrid") || viewType.startsWith("multiMonth");
}

/**
 * Format an event's start time for compact display in a month cell, honoring
 * the user's 12h/24h preference. Implemented locally (rather than via date-fns
 * locale formatting) so the output is deterministic regardless of locale.
 *
 * `timeZone` is the zone FullCalendar is configured to render with (its `local`
 * sentinel by default). The chip is derived from the same `event.start` instant
 * FullCalendar uses, so formatting in that same zone keeps the chip's time in
 * lockstep with what the calendar actually renders, even if the browser's local
 * zone differs from the configured one.
 */
export function formatEventTime(
  date: Date,
  timeFormat: TimeFormat,
  timeZone: string = LOCAL_TIME_ZONE
): string {
  const zoned =
    timeZone === LOCAL_TIME_ZONE ? date : toZonedTime(date, timeZone);
  const hours = zoned.getHours();
  const minutes = zoned.getMinutes();
  const mm = minutes.toString().padStart(2, "0");

  if (timeFormat === "24h") {
    return `${hours.toString().padStart(2, "0")}:${mm}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${mm} ${period}`;
}

/**
 * Alpha applied to a calendar's colour to produce a month-cell chip fill.
 * ~27%: enough that the calendar is identifiable at a glance and a week-long
 * band still reads as a band, faint enough that foreground-coloured text keeps
 * its contrast and a dense week doesn't turn into a block of saturated colour.
 */
const CHIP_TINT_ALPHA = "45";

/** #rgb, #rgba, #rrggbb or #rrggbbaa — any existing alpha is replaced. */
const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Tint a calendar colour for use as a month-view chip background.
 *
 * Month cells are dense, so a saturated fill per event overwhelms the grid and
 * forces the label into a contrast fight with its own background. Chips instead
 * use a tint of the calendar colour with normal foreground text; the
 * full-strength colour stays on the chip's border (its left edge) and on the
 * timed-event dot, which is where the colour still has to be unambiguous.
 *
 * Handles every hex form, including the 8-digit `#RRGGBBAA` that CalDAV feeds
 * store (Apple writes its calendar colours as e.g. `#FF9500FF`) — the existing
 * alpha channel is replaced, not appended to. Anything non-hex (a named colour,
 * an `rgb()` string) is passed through untouched rather than mangled.
 */
export function tintCalendarColor(color: string): string {
  if (!HEX_COLOR.test(color)) return color;

  const digits = color.slice(1);
  // Expand shorthand (#rgb / #rgba) to its full-length form first.
  const rgb =
    digits.length <= 4
      ? digits
          .slice(0, 3)
          .split("")
          .map((d) => d + d)
          .join("")
      : digits.slice(0, 6);

  return `#${rgb}${CHIP_TINT_ALPHA}`;
}

/**
 * Resolve the fill and border a calendar item's chip should carry.
 *
 * All-day items render as day-grid blocks — the month and year cells, and the
 * all-day row above the day and week grids — where a wall of saturated fills
 * makes a dense grid unreadable, so those are tinted and labelled in page
 * foreground. Timed items keep the full-strength fill: in the time grid the
 * block of colour is what conveys duration, and in a month cell FullCalendar
 * renders them as a dot rather than a block, so the fill is unused anyway.
 *
 * The border always carries the unmodified colour: it draws the chip's left
 * edge and is the source the timed-event dot reads its colour from.
 */
export function resolveEventChipColors(
  color: string,
  allDay: boolean
): { backgroundColor: string; borderColor: string } {
  return {
    backgroundColor: allDay ? tintCalendarColor(color) : color,
    borderColor: color,
  };
}

export interface MonthEventDisplay {
  /**
   * Whether this is a timed (non-all-day, non-task) event rendered in a
   * day-grid view, for any segment. Day-grid views color every segment of an
   * event, so this drives the accessible calendar-name label that keeps that
   * color cue from being the only way to identify the calendar.
   */
  isDayGridTimed: boolean;
  /**
   * Whether to render the month-style timed chip: a calendar-colored dot
   * followed by the event's start time. True only on the starting segment, so
   * multi-day continuation segments don't repeat the start time.
   */
  showTimeChip: boolean;
  /** The formatted start time, or "" when there is no time chip to show. */
  timeText: string;
}

/**
 * Decide how a timed event should be presented in a day-grid (month) cell.
 *
 * Issue #95: timed events in month view previously showed only a generic clock
 * icon, with no time and no calendar color, making them hard to scan next to
 * the colored all-day events. Timed, non-task events in day-grid views now get
 * a calendar-colored dot plus their start time. All-day events, tasks, and
 * time-grid views keep their existing treatment.
 *
 * `isStart` is FullCalendar's per-segment flag: a multi-day event is rendered
 * as one segment per day, and only the first segment carries the real start
 * time. Later segments must not repeat it, so the chip is shown only on the
 * starting segment.
 */
export function getMonthEventDisplay(params: {
  viewType: string;
  allDay: boolean;
  isTask: boolean;
  start: Date | null;
  isStart: boolean;
  timeFormat: TimeFormat;
  /**
   * The time zone FullCalendar is configured to render with. Defaults to its
   * `local` sentinel so the chip tracks the calendar's own rendering.
   */
  timeZone?: string;
}): MonthEventDisplay {
  const {
    viewType,
    allDay,
    isTask,
    start,
    isStart,
    timeFormat,
    timeZone = LOCAL_TIME_ZONE,
  } = params;

  const isDayGridTimed =
    isDayGridView(viewType) && !allDay && !isTask && start !== null;
  // The colored dot and time only belong on the starting segment; the calendar
  // identity (isDayGridTimed) applies to every colored segment.
  const showTimeChip = isDayGridTimed && isStart;

  return {
    isDayGridTimed,
    showTimeChip,
    timeText:
      showTimeChip && start ? formatEventTime(start, timeFormat, timeZone) : "",
  };
}
