/**
 * Sigwald availability: merge calendar busy intervals with work hours and derive
 * effective free capacity for Stage 1 ranking (tasks longer than the slot are deferred).
 */

import {
  addDays,
  formatInTimeZone,
  fromZonedTime,
  newDate,
  toZonedTime,
} from "@/lib/date-utils";
import { parseSelectedCalendars, parseWorkDays } from "@/lib/autoSchedule";
import { prisma } from "@/lib/prisma";

import type { TaskForRanking } from "@/lib/sigwald/rank-stage1";

type Interval = { start: Date; end: Date };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const out: Interval[] = [];
  let cur: Interval = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n.start.getTime() <= cur.end.getTime()) {
      cur = {
        start: cur.start,
        end: new Date(Math.max(cur.end.getTime(), n.end.getTime())),
      };
    } else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

function subtractInterval(r: Interval, b: Interval): Interval[] {
  if (b.end.getTime() <= r.start.getTime() || b.start.getTime() >= r.end.getTime()) {
    return [r];
  }
  const out: Interval[] = [];
  if (b.start.getTime() > r.start.getTime()) {
    out.push({
      start: r.start,
      end: new Date(Math.min(b.start.getTime(), r.end.getTime())),
    });
  }
  if (b.end.getTime() < r.end.getTime()) {
    out.push({
      start: new Date(Math.max(b.end.getTime(), r.start.getTime())),
      end: r.end,
    });
  }
  return out.filter((x) => x.end.getTime() > x.start.getTime());
}

function eventToBusyInterval(
  e: { start: Date; end: Date; status: string | null; transparency: string | null },
  rangeStart: Date,
  rangeEnd: Date
): Interval | null {
  const st = e.status?.toUpperCase() ?? null;
  if (st === "CANCELLED") {
    return null;
  }
  const tr = e.transparency?.toUpperCase() ?? null;
  if (tr === "TRANSPARENT") {
    return null;
  }

  const start = e.start.getTime() > rangeStart.getTime() ? e.start : rangeStart;
  const end = e.end.getTime() < rangeEnd.getTime() ? e.end : rangeEnd;
  if (end.getTime() <= start.getTime()) {
    return null;
  }
  return { start, end };
}

function buildWorkDayRangesUtc(
  now: Date,
  timeZone: string,
  workDays: number[],
  workHourStart: number,
  workHourEnd: number,
  numDays: number
): Interval[] {
  const wd = workDays.length > 0 ? workDays : [0, 1, 2, 3, 4, 5, 6];
  const ranges: Interval[] = [];
  let ymd = formatInTimeZone(now, timeZone, "yyyy-MM-dd");

  for (let i = 0; i < numDays; i++) {
    const noonLocal = fromZonedTime(`${ymd}T12:00:00`, timeZone);
    const zWall = toZonedTime(noonLocal, timeZone);
    const dow = zWall.getDay();

    if (wd.includes(dow)) {
      const ws = fromZonedTime(
        `${ymd}T${pad2(workHourStart)}:00:00`,
        timeZone
      );
      const we = fromZonedTime(`${ymd}T${pad2(workHourEnd)}:00:00`, timeZone);
      if (we.getTime() > ws.getTime()) {
        ranges.push({ start: ws, end: we });
      }
    }

    ymd = formatInTimeZone(addDays(noonLocal, 1), timeZone, "yyyy-MM-dd");
  }

  return ranges;
}

function freeSegmentsInHorizon(
  now: Date,
  horizon: Date,
  workRanges: Interval[],
  busyMerged: Interval[]
): Interval[] {
  const free: Interval[] = [];

  for (const wr of workRanges) {
    const segStart = wr.start.getTime() > now.getTime() ? wr.start : now;
    const segEnd = wr.end.getTime() < horizon.getTime() ? wr.end : horizon;
    if (segEnd.getTime() <= segStart.getTime()) {
      continue;
    }

    let remaining: Interval[] = [{ start: segStart, end: segEnd }];
    for (const b of busyMerged) {
      remaining = remaining.flatMap((r) => subtractInterval(r, b));
    }
    free.push(...remaining);
  }

  return mergeIntervals(free);
}

/**
 * One-line copy for Focus briefing: current free slice, busy block, or time until next free.
 */
export function computeSlotNarrative(
  now: Date,
  free: Interval[],
  busyMerged: Interval[]
): string | null {
  const t = now.getTime();
  const containingFree = free.find(
    (f) => f.start.getTime() <= t && t < f.end.getTime()
  );
  if (containingFree) {
    const mins = Math.floor(
      (containingFree.end.getTime() - t) / 60_000
    );
    return `About ${mins} min until your next calendar block`;
  }
  const inBusy = busyMerged.find(
    (b) => b.start.getTime() <= t && t < b.end.getTime()
  );
  if (inBusy) {
    const mins = Math.floor((inBusy.end.getTime() - t) / 60_000);
    return `In a calendar block — about ${mins} min until free time`;
  }
  const nextFree = free.find((f) => f.start.getTime() >= t);
  if (nextFree) {
    const mins = Math.floor((nextFree.start.getTime() - t) / 60_000);
    return `Next free block starts in about ${mins} min`;
  }
  return null;
}

function effectiveCapacityMinutesFromFree(free: Interval[], now: Date): number {
  const containing = free.find(
    (f) => f.start.getTime() <= now.getTime() && now.getTime() < f.end.getTime()
  );
  if (containing) {
    return Math.max(
      0,
      Math.floor((containing.end.getTime() - now.getTime()) / 60_000)
    );
  }
  const next = free.find((f) => f.start.getTime() >= now.getTime());
  if (next) {
    return Math.max(
      0,
      Math.floor((next.end.getTime() - next.start.getTime()) / 60_000)
    );
  }
  return 0;
}

function isWithinWorkHours(
  now: Date,
  timeZone: string,
  workDays: number[],
  workHourStart: number,
  workHourEnd: number
): boolean {
  const wd = workDays.length > 0 ? workDays : [0, 1, 2, 3, 4, 5, 6];
  const z = toZonedTime(now, timeZone);
  const hour = z.getHours();
  const day = z.getDay();
  return (
    wd.includes(day) && hour >= workHourStart && hour < workHourEnd
  );
}

export interface SigwaldAvailabilitySummary {
  /** Minutes available in the current free slice, or width of the next free slice if busy */
  effectiveCapacityMinutes: number;
  /** When true, Focus queue drops tasks longer than effectiveCapacityMinutes */
  applyTaskDurationFilter: boolean;
  inWorkHours: boolean;
  hasEnabledCalendarFeeds: boolean;
  freeIntervals: { start: string; end: string }[];
  /** Short line for Focus header when calendars are connected */
  slotNarrative?: string | null;
}

/**
 * Loads calendar events and user schedule settings to compute free capacity during work hours.
 */
export async function computeSigwaldAvailabilitySummary(
  userId: string,
  now: Date = newDate()
): Promise<SigwaldAvailabilitySummary> {
  const [autoRow, userRow, feedCount] = await Promise.all([
    prisma.autoScheduleSettings.findUnique({ where: { userId } }),
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.calendarFeed.count({ where: { userId, enabled: true } }),
  ]);

  const timeZone = userRow?.timeZone ?? "UTC";

  const auto = autoRow ?? {
    workHourStart: 9,
    workHourEnd: 17,
    workDays: "[1,2,3,4,5]",
    selectedCalendars: "[]",
  };
  const workHourStart = auto.workHourStart;
  const workHourEnd = auto.workHourEnd;
  const workDays = parseWorkDays(auto.workDays);
  const selectedIds = parseSelectedCalendars(auto.selectedCalendars);

  const inWork = isWithinWorkHours(
    now,
    timeZone,
    workDays,
    workHourStart,
    workHourEnd
  );

  if (feedCount === 0 || !inWork) {
    return {
      effectiveCapacityMinutes: Number.POSITIVE_INFINITY,
      applyTaskDurationFilter: false,
      inWorkHours: inWork,
      hasEnabledCalendarFeeds: feedCount > 0,
      freeIntervals: [],
      slotNarrative: null,
    };
  }

  const horizon = addDays(now, 14);

  const feedWhere = {
    feed: {
      userId,
      enabled: true,
      ...(selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
    },
    start: { lt: horizon },
    end: { gt: now },
  };

  const events = await prisma.calendarEvent.findMany({
    where: feedWhere,
    select: {
      start: true,
      end: true,
      status: true,
      transparency: true,
    },
  });

  const busyRaw: Interval[] = [];
  for (const e of events) {
    const b = eventToBusyInterval(e, now, horizon);
    if (b) {
      busyRaw.push(b);
    }
  }
  const busyMerged = mergeIntervals(busyRaw);

  const workRanges = buildWorkDayRangesUtc(
    now,
    timeZone,
    workDays,
    workHourStart,
    workHourEnd,
    14
  );

  const free = freeSegmentsInHorizon(now, horizon, workRanges, busyMerged);
  const effectiveCapacityMinutes = effectiveCapacityMinutesFromFree(free, now);

  const freeIntervals = free.map((f) => ({
    start: f.start.toISOString(),
    end: f.end.toISOString(),
  }));

  const slotNarrative = computeSlotNarrative(now, free, busyMerged);

  return {
    effectiveCapacityMinutes,
    applyTaskDurationFilter: true,
    inWorkHours: true,
    hasEnabledCalendarFeeds: true,
    freeIntervals,
    slotNarrative,
  };
}

/**
 * Removes tasks whose estimated duration exceeds the current effective free window.
 */
export function filterTasksByAvailabilityCapacity(
  tasks: TaskForRanking[],
  effectiveCapacityMinutes: number,
  applyFilter: boolean
): TaskForRanking[] {
  if (!applyFilter || !Number.isFinite(effectiveCapacityMinutes)) {
    return tasks;
  }
  return tasks.filter((t) => (t.duration ?? 30) <= effectiveCapacityMinutes);
}
