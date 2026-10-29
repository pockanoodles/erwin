import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { computeSigwaldAvailabilitySummary } from "@/lib/sigwald/availability";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "SigwaldAvailabilityAPI";

/**
 * GET /api/sigwald/availability
 * Returns merged busy/free summary for Sigwald ranking (work hours + calendar transparency/status).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const summary = await computeSigwaldAvailabilitySummary(auth.userId, newDate());

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
      "Sigwald availability failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load availability" },
      { status: 500 }
    );
  }
}
