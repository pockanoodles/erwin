import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinTaskMaterialCountsAPI";

/**
 * GET /api/erwin/tasks/material-counts
 * `{ [taskId]: { total, cited } }` for every task with linked materials — the
 * Tasks sheet's Mat column. Kept apart from the task list itself: materials
 * change only on a Canvas sync, not on a task edit.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const rows = await prisma.taskMaterialLink.groupBy({
      by: ["taskId", "reason"],
      where: { task: { userId: auth.userId } },
      _count: { _all: true },
    });
    const counts: Record<string, { total: number; cited: number }> = {};
    for (const row of rows) {
      const entry = (counts[row.taskId] ??= { total: 0, cited: 0 });
      entry.total += row._count._all;
      if (row.reason === "DESCRIPTION") entry.cited += row._count._all;
    }
    return NextResponse.json(counts);
  } catch (error) {
    logger.error(
      "Erwin task material counts failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load material counts" }, { status: 500 });
  }
}
