import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { loadGradebooks } from "@/lib/erwin/gradebook";
import { logger } from "@/lib/logger";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinGradesAPI";

/**
 * GET /api/erwin/grades[?courseId=<Erwin course id>]
 *
 * The gradebook: every mirrored course (or the one asked for) with Canvas's
 * current and final totals, Erwin's estimate beside them, group subtotals,
 * and each assignment's submission state, score, class statistics, feedback
 * and quiz rules. Read-only; Canvas sync keeps it current.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const courseId = request.nextUrl.searchParams.get("courseId") ?? undefined;
    return NextResponse.json(await loadGradebooks(auth.userId, courseId));
  } catch (error) {
    logger.error(
      "Erwin grades failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load grades" }, { status: 500 });
  }
}
