import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinGoalsOverviewAPI";

const COMPLETION_WINDOW_DAYS = 30;

/**
 * Group key convention (read-only view over Task.source):
 * - "venture:<slug>" stays raw — the glue layer owns the slug vocabulary, so
 *   Erwin never hardcodes a slug list; new ventures appear as new groups.
 * - "CANVAS" stays raw (Canvas LMS sync).
 * - null and anything unrecognized collapse into UNTAGGED_KEY so manual or
 *   stray-source tasks stay visible instead of silently dropped.
 */
const UNTAGGED_KEY = "untagged";

function groupKeyForSource(source: string | null): string {
  if (source === "CANVAS" || source?.startsWith("venture:")) {
    return source;
  }
  return UNTAGGED_KEY;
}

interface OverviewGroup {
  key: string;
  openCount: number;
  doneLast30: number;
  tasks: Array<{
    id: string;
    title: string;
    dueDate: Date | null;
    urgencyTier: string | null;
  }>;
}

/**
 * GET /api/erwin/goals/overview
 *
 * Read-only payload for the Goals page: the active cycle (season), the
 * user's open tasks grouped by source with a trailing-30-day completion
 * count per group, and any explicit Goal rows. Groups sort by open count
 * descending with the untagged group pinned last; tasks within a group sort
 * by due date ascending, nulls last.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const now = newDate();
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - COMPLETION_WINDOW_DAYS);

    const [activeCycle, openTasks, completedBySource, goals] =
      await Promise.all([
        prisma.goalCycle.findFirst({
          where: { userId, status: "active" },
          orderBy: { createdAt: "desc" },
          select: { id: true, theme: true, startDate: true, endDate: true },
        }),
        prisma.task.findMany({
          where: { userId, status: { not: "completed" } },
          select: {
            id: true,
            title: true,
            dueDate: true,
            urgencyTier: true,
            source: true,
          },
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
        }),
        prisma.task.groupBy({
          by: ["source"],
          where: {
            userId,
            status: "completed",
            completedAt: { gte: windowStart },
          },
          _count: { _all: true },
        }),
        prisma.goal.findMany({
          where: { userId },
          orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            whyItMatters: true,
            definitionOfDone: true,
            status: true,
            importanceScore: true,
            cycle: { select: { theme: true } },
          },
        }),
      ]);

    const groupsByKey = new Map<string, OverviewGroup>();
    const ensureGroup = (key: string): OverviewGroup => {
      let group = groupsByKey.get(key);
      if (!group) {
        group = { key, openCount: 0, doneLast30: 0, tasks: [] };
        groupsByKey.set(key, group);
      }
      return group;
    };

    for (const task of openTasks) {
      const group = ensureGroup(groupKeyForSource(task.source));
      group.openCount += 1;
      group.tasks.push({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        urgencyTier: task.urgencyTier,
      });
    }

    for (const completed of completedBySource) {
      const group = ensureGroup(groupKeyForSource(completed.source));
      group.doneLast30 += completed._count._all;
    }

    const groups = Array.from(groupsByKey.values()).sort((a, b) => {
      if (a.key === UNTAGGED_KEY) return 1;
      if (b.key === UNTAGGED_KEY) return -1;
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      return a.key.localeCompare(b.key);
    });

    return NextResponse.json({
      activeCycle,
      groups,
      goals: goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        whyItMatters: goal.whyItMatters,
        definitionOfDone: goal.definitionOfDone,
        status: goal.status,
        importanceScore: goal.importanceScore,
        cycleTheme: goal.cycle.theme,
      })),
    });
  } catch (error) {
    logger.error(
      "Erwin goals overview failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load goals overview" },
      { status: 500 }
    );
  }
}
