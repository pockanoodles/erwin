/**
 * Briefing-only calendar hints and progress aggregates (docs/focus-mode.md §1.2).
 */

import {
  addDays,
  formatInTimeZone,
  fromZonedTime,
  startOfDay,
  subDays,
} from "@/lib/date-utils";
import { computeErwinAvailabilitySummary } from "@/lib/erwin/availability";
import { prisma } from "@/lib/prisma";

/**
 * Sums overlap of free intervals with the user&apos;s local calendar day.
 */
export function minutesFreeTodayFromIntervals(
  freeIntervals: { start: string; end: string }[],
  now: Date,
  timeZone: string
): number {
  const ymd = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const dayStart = fromZonedTime(`${ymd}T00:00:00`, timeZone);
  const dayEnd = addDays(dayStart, 1);
  let ms = 0;

  for (const iv of freeIntervals) {
    const s = new Date(iv.start).getTime();
    const e = new Date(iv.end).getTime();
    const a = Math.max(s, dayStart.getTime());
    const b = Math.min(e, dayEnd.getTime());
    if (b > a) {
      ms += b - a;
    }
  }

  return Math.floor(ms / 60_000);
}

export async function getBriefingCalendarHints(
  userId: string,
  now: Date,
  timeZone: string
): Promise<{
  freeHoursToday: number | null;
  nextEvent: { title: string; startsIn: string } | null;
}> {
  const summary = await computeErwinAvailabilitySummary(userId, now);

  let freeHoursToday: number | null = null;
  if (
    summary.hasEnabledCalendarFeeds &&
    summary.freeIntervals.length > 0 &&
    summary.inWorkHours
  ) {
    const mins = minutesFreeTodayFromIntervals(
      summary.freeIntervals,
      now,
      timeZone
    );
    freeHoursToday = Math.round((mins / 60) * 10) / 10;
  }

  const upcoming = await prisma.calendarEvent.findMany({
    where: {
      feed: { userId, enabled: true },
      start: { gt: now },
    },
    orderBy: { start: "asc" },
    take: 12,
    select: { title: true, start: true, status: true },
  });

  const next = upcoming.find((e) => {
    const st = e.status?.toUpperCase() ?? "";
    return st !== "CANCELLED";
  });

  let nextEvent: { title: string; startsIn: string } | null = null;
  if (next?.start) {
    const ms = next.start.getTime() - now.getTime();
    const mins = Math.max(0, Math.floor(ms / 60_000));
    let startsIn: string;
    if (mins < 90) {
      startsIn = `in ${mins}m`;
    } else if (mins < 24 * 60) {
      startsIn = `in ${Math.floor(mins / 60)}h`;
    } else {
      startsIn = formatInTimeZone(next.start, timeZone, "MMM d, h:mm a");
    }
    nextEvent = {
      title: next.title || "Calendar event",
      startsIn,
    };
  }

  return { freeHoursToday, nextEvent };
}

export async function getBriefingProgressStats(userId: string, now: Date) {
  const dayStart = startOfDay(now);
  const weekStart = subDays(dayStart, 7);

  const [tasksCompletedToday, weekCompleted] = await Promise.all([
    prisma.task.count({
      where: {
        userId,
        status: "completed",
        completedAt: { gte: dayStart },
      },
    }),
    prisma.task.count({
      where: {
        userId,
        status: "completed",
        completedAt: { gte: weekStart },
      },
    }),
  ]);

  const avgTasksPerDay = Math.round((weekCompleted / 7) * 10) / 10;

  return {
    tasksCompletedToday,
    tasksCompletedThisWeek: weekCompleted,
    avgTasksPerDay,
  };
}
