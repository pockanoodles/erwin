import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { computeErwinAvailabilitySummary } from "@/lib/erwin/availability";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ErwinAvailabilityAPI";

/**
 * GET /api/erwin/availability
 * Returns merged busy/free summary for Erwin ranking (work hours + calendar transparency/status).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const summary = await computeErwinAvailabilitySummary(auth.userId, newDate());

    return NextResponse.json({
      effectiveCapacityMinutes: Number.isFinite(summary.effectiveCapacityMinutes)
        ? summary.effectiveCapacityMinutes
        : null,
      applyTaskDurationFilter: summary.applyTaskDurationFilter,
      inWorkHours: summary.inWorkHours,
      hasEnabledCalendarFeeds: summary.hasEnabledCalendarFeeds,
      freeIntervals: summary.freeIntervals,
    });
  } catch (error) {
    logger.error(
      "Erwin availability failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load availability" },
      { status: 500 }
    );
  }
}
