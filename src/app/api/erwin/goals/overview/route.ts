import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { ensureCurrentHex, hexForDate, hexLabel } from "@/lib/erwin/hex";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinGoalsOverviewAPI";

const COMPLETION_WINDOW_DAYS = 30;

/**
 * GET /api/erwin/goals/overview
 *
 * Payload for the Goals page. The current hex (fixed two-month block) is
 * lazily provisioned so an active cycle always exists. Returns the hex (with
 * its Build stats and boss), the goal DAG for it (goals with parentGoalIds +
 * their linked tasks), and open tasks with no goal (graph tray).
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

    const cycle = await ensureCurrentHex(prisma, userId);
    const hex = hexForDate(cycle.startDate);

    const [openTasks, goals] = await Promise.all([
      prisma.task.findMany({
        where: { userId, status: { not: "completed" } },
        select: {
          id: true,
          title: true,
          dueDate: true,
          urgencyTier: true,
          goalLinks: { select: { goalId: true } },
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      }),
      prisma.goal.findMany({
        where: { userId, cycleId: cycle.id },
        orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          whyItMatters: true,
          definitionOfDone: true,
          status: true,
          importanceScore: true,
          develops: true,
          isBoss: true,
          targetDate: true,
          parentLinks: { select: { parentId: true } },
          taskLinks: {
            where: {
              task: {
                OR: [
                  { status: { not: "completed" } },
                  { completedAt: { gte: windowStart } },
                ],
              },
            },
            select: {
              task: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  dueDate: true,
                  urgencyTier: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const flatGoals = goals.map(({ parentLinks, taskLinks, ...goal }) => ({
      ...goal,
      parentGoalIds: parentLinks.map((link) => link.parentId),
      tasks: taskLinks
        .map((link) => link.task)
        .sort((a, b) => {
          if (!a.dueDate) return b.dueDate ? 1 : 0;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        }),
    }));

    // The hex's boss: the active boss goal with the nearest target date
    // (undated bosses sort last) — same "next boss" rule as the ops HUD.
    const boss =
      flatGoals
        .filter((goal) => goal.isBoss && goal.status === "active")
        .sort((a, b) => {
          if (!a.targetDate) return b.targetDate ? 1 : 0;
          if (!b.targetDate) return -1;
          return a.targetDate.getTime() - b.targetDate.getTime();
        })[0] ?? null;

    return NextResponse.json({
      activeCycle: {
        id: cycle.id,
        theme: cycle.theme,
        focusStats: cycle.focusStats,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        hex: {
          year: hex.year,
          index: hex.index,
          label: hexLabel(hex),
        },
        boss: boss
          ? { id: boss.id, title: boss.title, targetDate: boss.targetDate }
          : null,
      },
      goals: flatGoals,
      unassignedTasks: openTasks
        .filter((task) => task.goalLinks.length === 0)
        .map(({ id, title, dueDate, urgencyTier }) => ({
          id,
          title,
          dueDate,
          urgencyTier,
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
