import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { listShifts, parseShiftWeek, replaceShiftWeek } from "@/lib/erwin/shifts";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinShiftsAPI";

/**
 * PUT /api/erwin/shifts
 * Body: { source, feedName?, color?, windowStart, windowEnd, shifts: ShiftInput[] }
 * Replaces one schedule week of work shifts (lib/erwin/shifts). An empty
 * `shifts` list is a real answer — that week has none — and clears the window.
 * Returns { feedId, removed, written }.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const week = parseShiftWeek(await request.json().catch(() => null));
    if (typeof week === "string") {
      return new NextResponse(week, { status: 400 });
    }

    const result = await prisma.$transaction((tx) => replaceShiftWeek(tx, auth.userId, week));
    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      "Error replacing shift week:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * GET /api/erwin/shifts?source=im&from=<iso>&to=<iso>
 * Shifts overlapping [from, to), soonest first — what the reminder job polls.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const params = request.nextUrl.searchParams;
    const source = params.get("source") ?? "";
    const from = new Date(params.get("from") ?? "");
    const to = new Date(params.get("to") ?? "");
    if (!source || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return new NextResponse("source, from and to (ISO, to after from) are required", { status: 400 });
    }

    const shifts = await listShifts(prisma, auth.userId, source, from, to);
    return NextResponse.json({ shifts });
  } catch (error) {
    logger.error(
      "Error listing shifts:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
