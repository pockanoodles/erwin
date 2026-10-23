import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { startOfDay, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { notClosedWhere } from "@/lib/erwin/open-work";

const LOG_SOURCE = "ErwinProgressSummaryAPI";

/**
 * GET /api/erwin/progress/summary
 * Lightweight stats for the Progress tab (expand with charts later).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const now = newDate();
    const todayStart = startOfDay(now);
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);

    const [completedToday, completedLast7Days, pendingOpen, interactionsLast7Days] =
      await Promise.all([
        prisma.task.count({
          where: {
            userId,
            status: "completed",
            completedAt: { gte: todayStart },
          },
        }),
        prisma.task.count({
          where: {
            userId,
            status: "completed",
            completedAt: { gte: weekStart },
          },
        }),
        prisma.task.count({
          where: { userId, ...notClosedWhere() },
        }),
        prisma.taskInteraction.count({
          where: {
            createdAt: { gte: weekStart },
            action: { in: ["COMPLETED", "SKIPPED"] },
            task: { userId },
          },
        }),
      ]);

    return NextResponse.json({
      completedToday,
      completedLast7Days,
      pendingOpen,
      interactionsLast7Days,
    });
  } catch (error) {
    logger.error(
      "Erwin progress summary failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load progress" },
      { status: 500 }
    );
  }
}
