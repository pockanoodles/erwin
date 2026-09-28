import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinHealthAPI";

/**
 * GET /api/erwin/health
 *
 * Liveness that includes the database. The app process can keep serving
 * redirects and static pages with Postgres down, so "port answers" proves
 * nothing — this round-trips a query. 200 `{ ok: true }` or 503 naming the
 * failure. Polled by the ops health check.
 */
export async function GET(request: NextRequest) {
  try {
    // Inside the try: auth can itself touch the database.
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Erwin health: database unreachable", { error: message }, LOG_SOURCE);
    return NextResponse.json(
      { ok: false, error: "database unreachable" },
      { status: 503 }
    );
  }
}
