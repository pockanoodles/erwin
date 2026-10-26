import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  getBriefingCalendarHints,
  getBriefingProgressStats,
} from "@/lib/erwin/briefing-extras";
import { buildFocusQueueCore } from "@/lib/erwin/focus-queue-core";
import { humanCountdown } from "@/lib/erwin/human-countdown";
import { isDangerResolved } from "@/lib/erwin/rank-stage1";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ErwinFocusBriefingAPI";

/**
 * GET /api/erwin/focus/briefing — daily briefing payload (docs/focus-mode.md §1.2).
 * Each task in it carries what the modules add (Courses: its course, its
 * share of the grade and, in danger, the grade if it's missed).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const now = newDate();

    // Due dates in the core are the moments tasks are due by (lib/erwin/due.ts),
    // read in the person's zone.
    const core = await buildFocusQueueCore(userId);
    const timeZone = core.timeZone;

    const tasksDueToday = core.filtered.filter((t) => {
      if (!t.dueDate) {
        return false;
      }
      const d = new Date(t.dueDate);
      return formatInTimeZone(d, timeZone, "yyyy-MM-dd") === formatInTimeZone(now, timeZone, "yyyy-MM-dd");
    }).length;

    const tasksDueThisWeek = core.filtered.filter((t) => {
      if (!t.dueDate) {
        return false;
      }
      const d = new Date(t.dueDate);
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return d >= now && d <= weekEnd;
    }).length;

    const dangerMinimal = core.filtered.filter((t) =>
      isDangerResolved(t, now)
    );

    const rowById = new Map(core.rows.map((r) => [r.id, r]));

    const dangerZoneTasks = dangerMinimal.flatMap((dm) => {
      const row = rowById.get(dm.id);
      if (!row) {
        return [];
      }
      const due = dm.dueDate ? new Date(dm.dueDate) : now;
      return [
        {
          id: row.id,
          title: row.title,
          dueAt: due.toISOString(),
          countdownHuman: humanCountdown(due, now, timeZone),
          skipCount: row.skipCount,
          ...core.facts.get(row.id),
        },
      ];
    });

    const topTasks = core.ordered.slice(0, 5).flatMap((t) => {
      const row = rowById.get(t.id);
      const m = core.meta.get(t.id);
      if (!row || !m) {
        return [];
      }
      const due = t.dueDate ? new Date(t.dueDate) : null;
      return [
        {
          id: row.id,
          title: row.title,
          category: row.category ?? "PERSONAL",
          dueAt: due?.toISOString() ?? null,
          countdownHuman: due ? humanCountdown(due, now, timeZone) : null,
          estimatedDuration: row.duration ?? 30,
          urgencyTier: m.urgencyTier,
          baseScore: m.baseScore,
          ...core.facts.get(row.id),
        },
      ];
    });

    const calendar = await getBriefingCalendarHints(userId, now, timeZone);
    const progress = await getBriefingProgressStats(userId, now);

    const payload = {
      date: formatInTimeZone(now, timeZone, "EEEE, MMMM d"),
      tasksDueToday,
      tasksDueThisWeek,
      dangerZoneTasks,
      totalPendingTasks: core.filtered.length,
      freeHoursToday: calendar.freeHoursToday,
      nextEvent: calendar.nextEvent,
      topTasks,
      tasksCompletedToday: progress.tasksCompletedToday,
      tasksCompletedThisWeek: progress.tasksCompletedThisWeek,
      avgTasksPerDay: progress.avgTasksPerDay,
    };

    return NextResponse.json(payload);
  } catch (error) {
    logger.error(
      "Erwin focus briefing failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load briefing" },
      { status: 500 }
    );
  }
}
