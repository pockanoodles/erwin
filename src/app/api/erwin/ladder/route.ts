import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { ensureCurrentHex, hexOfDay } from "@/lib/erwin/hex";
import { buildLadder } from "@/lib/erwin/ladder";
import { openWorkWhere } from "@/lib/erwin/open-work";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinLadderAPI";

/** A date-only value (a boss's day, stored at noon UTC) keeps its own date. */
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /api/erwin/ladder?year=2026&index=5
 *
 * The Ladder page: one hex (the current one by default) as a character
 * sheet. Stat XP is derived here from finished work on every read
 * (lib/erwin/xp.ts) and never stored. The current hex is provisioned first,
 * so it always has a row to carry its theme and Build.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const now = newDate();
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    });
    const timeZone = settings?.timeZone ?? "UTC";
    const dayOf = (d: Date) => formatInTimeZone(d, timeZone, "yyyy-MM-dd");
    const today = dayOf(now);

    const params = request.nextUrl.searchParams;
    const year = Number(params.get("year"));
    const index = Number(params.get("index"));
    const hex =
      Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(index) && index >= 1 && index <= 6
        ? { year, index }
        : hexOfDay(today);

    const running = await ensureCurrentHex(prisma, userId);

    const [goals, done, open, cycles] = await Promise.all([
      prisma.goal.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          isBoss: true,
          status: true,
          develops: true,
          targetDate: true,
          updatedAt: true,
          externalId: true,
          importanceScore: true,
          cycleId: true,
          whyItMatters: true,
          definitionOfDone: true,
          canvasAssignmentId: true,
          parentLinks: { select: { parentId: true } },
        },
      }),
      // Subtasks are checklist items under a task, not work of their own.
      prisma.task.findMany({
        where: { userId, parentTaskId: null, status: "completed", completedAt: { not: null } },
        select: {
          id: true,
          title: true,
          completedAt: true,
          courseName: true,
          goalLinks: { select: { goalId: true } },
        },
      }),
      // Open the way the top bar counts it: work you can act on now.
      prisma.task.findMany({
        where: openWorkWhere(userId, now),
        select: { id: true, goalLinks: { select: { goalId: true } } },
      }),
      prisma.goalCycle.findMany({
        where: { userId },
        select: { id: true, theme: true, focusStats: true, startDate: true },
      }),
    ]);

    return NextResponse.json(
      buildLadder({
        today,
        hex,
        currentCycleId: running.id,
        goals: goals.map((goal) => ({
          id: goal.id,
          title: goal.title,
          isBoss: goal.isBoss,
          status: goal.status,
          develops: goal.develops,
          parentIds: goal.parentLinks.map((link) => link.parentId),
          day: goal.targetDate ? dateOnly(goal.targetDate) : null,
          updatedDay: dayOf(goal.updatedAt),
          targetDate: goal.targetDate?.toISOString() ?? null,
          externalId: goal.externalId,
          importanceScore: goal.importanceScore,
          cycleId: goal.cycleId,
          whyItMatters: goal.whyItMatters,
          definitionOfDone: goal.definitionOfDone,
          bound: goal.canvasAssignmentId !== null,
        })),
        done: done.map((task) => ({
          id: task.id,
          title: task.title,
          day: dayOf(task.completedAt!),
          courseName: task.courseName,
          goalIds: task.goalLinks.map((link) => link.goalId),
        })),
        open: open.map((task) => ({
          id: task.id,
          goalIds: task.goalLinks.map((link) => link.goalId),
        })),
        cycles: cycles.map((cycle) => ({
          id: cycle.id,
          theme: cycle.theme,
          focusStats: cycle.focusStats,
          first: dateOnly(cycle.startDate),
        })),
      })
    );
  } catch (error) {
    logger.error(
      "Erwin ladder failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load the Ladder" }, { status: 500 });
  }
}
