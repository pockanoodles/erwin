import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "SigwaldProgressBySourceAPI";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

/**
 * GET /api/sigwald/progress/by-source?days=7
 *
 * Completions in the trailing window, grouped by the task's raw `source`
 * string. Feeds the weekly reflection job in personal-ops: venture-tagged
 * tasks carry `source: "venture:<slug>"`, but the prefix convention is the
 * caller's — Sigwald just groups by whatever `source` holds (Canvas sync
 * values, null for manual tasks, etc.) and reports counts. `source: null`
 * comes back as a group like any other so untagged work stays visible
 * rather than silently dropped.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const daysParam = Number(request.nextUrl.searchParams.get("days") ?? DEFAULT_DAYS);
    const days = Number.isFinite(daysParam)
      ? Math.min(Math.max(Math.trunc(daysParam), 1), MAX_DAYS)
      : DEFAULT_DAYS;

    const now = newDate();
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - days);

    const groups = await prisma.task.groupBy({
      by: ["source"],
      where: {
        userId,
        status: "completed",
        completedAt: { gte: windowStart },
      },
      _count: { _all: true },
    });

    return NextResponse.json({
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      days,
      groups: groups.map((group) => ({
        source: group.source,
        count: group._count._all,
      })),
    });
  } catch (error) {
    logger.error(
      "Sigwald progress by-source failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load completions by source" },
      { status: 500 }
    );
  }
}
