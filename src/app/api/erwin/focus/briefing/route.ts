import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  getBriefingCalendarHints,
  getBriefingProgressStats,
} from "@/lib/erwin/briefing-extras";
import { fetchGradeProjectionsForDangerTasks } from "@/lib/erwin/fetch-canvas-grade-projections";
import { buildFocusQueueCore } from "@/lib/erwin/focus-queue-core";
import { humanCountdown } from "@/lib/erwin/human-countdown";
import { isDangerResolved } from "@/lib/erwin/rank-stage1";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinFocusBriefingAPI";

/**
 * GET /api/erwin/focus/briefing — daily briefing payload (docs/focus-mode.md §1.2).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const now = newDate();

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });
    const timeZone = userSettings?.timeZone ?? "UTC";

    const core = await buildFocusQueueCore(userId);

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

    const projections = await fetchGradeProjectionsForDangerTasks(
      userId,
      core.rows,
      core.meta
    );

    const dangerZoneTasks = dangerMinimal.map((dm) => {
      const row = core.rows.find((r) => r.id === dm.id);
      if (!row) {
        return null;
      }
      const due = row.dueDate ? new Date(row.dueDate) : now;
      return {
        id: row.id,
        title: row.title,
        courseName: row.courseName,
        dueAt: due.toISOString(),
        countdownHuman: humanCountdown(due, now),
        gradeImpactPercent: row.gradeWeightPercent ?? 0,
        skipCount: row.skipCount,
      };
    }).filter((x): x is NonNullable<typeof x> => x != null);

    const dangerProjections = dangerZoneTasks.flatMap((dt) => {
      const p = projections.get(dt.id);
      if (!p) {
        return [];
      }
      return [
        {
          taskId: dt.id,
          taskTitle: dt.title,
          courseName: dt.courseName ?? "",
          currentCourseGrade: p.currentCourseGrade,
          gradeIfMissed: p.gradeIfMissed,
          letterGradeCurrent: p.letterGradeCurrent,
          letterGradeIfMissed: p.letterGradeIfMissed,
        },
      ];
    });

    const topTasks = core.ordered.slice(0, 5).map((t) => {
      const row = core.rows.find((r) => r.id === t.id)!;
      const m = core.meta.get(t.id)!;
      const due = row.dueDate ? new Date(row.dueDate) : null;
      return {
        id: row.id,
        title: row.title,
        courseName: row.courseName,
        category: row.category ?? "PERSONAL",
        dueAt: due?.toISOString() ?? null,
        countdownHuman: due ? humanCountdown(due, now) : null,
        estimatedDuration: row.duration ?? 30,
        gradeImpactPercent: row.gradeWeightPercent ?? null,
        urgencyTier: m.urgencyTier,
        baseScore: m.baseScore,
      };
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
      dangerProjections,
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
