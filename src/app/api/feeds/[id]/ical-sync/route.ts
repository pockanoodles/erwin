import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { syncIcalFeed } from "@/lib/ical-feed";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ICalFeedSyncAPI";

/**
 * Syncs an iCal (ICS URL) feed now: re-fetches its URL and replaces its
 * events. The background sync loop does the same every interval
 * (`runPeriodicIcalSyncs`). A failed fetch or parse leaves the feed's events
 * as they were and answers 502 with the reason.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const { id: feedId } = await params;

    const feed = await prisma.calendarFeed.findUnique({
      where: { id: feedId, userId },
    });

    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    if (feed.type !== "ICAL") {
      return NextResponse.json({ error: "Not an iCal feed" }, { status: 400 });
    }

    if (!feed.url) {
      return NextResponse.json(
        { error: "iCal feed has no URL" },
        { status: 400 }
      );
    }

    try {
      const count = await syncIcalFeed({ id: feedId, userId, url: feed.url });
      return NextResponse.json({ success: true, count });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync iCal feed";
      logger.error(
        "Failed to fetch/parse iCal feed",
        { error: message, feedId },
        LOG_SOURCE
      );
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    logger.error(
      "Failed to sync iCal feed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to sync iCal feed" },
      { status: 500 }
    );
  }
}
