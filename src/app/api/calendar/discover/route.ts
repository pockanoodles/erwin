import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { discoverCalendar } from "@/lib/calendar-discovery";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "CalendarDiscoverAPI";

// Where the calendar for an email address lives (see calendar-discovery.ts).
// The address stays here; only its domain is looked up.
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.slice(0, 320) : "";
  if (!email) {
    return NextResponse.json({ error: "An email address is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await discoverCalendar(email));
  } catch (error) {
    logger.error(
      "Calendar discovery failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ kind: "unknown" });
  }
}
