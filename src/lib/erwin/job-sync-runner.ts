/**
 * Periodic Canvas + CalDAV sync invoked by the BullMQ worker (`src/worker/worker.ts`).
 */

import { CalDAVCalendarService } from "@/lib/caldav-calendar";
import { syncCanvasForUser } from "@/lib/canvas/sync-canvas";
import { newDate } from "@/lib/date-utils";
import { DEFAULT_CANVAS_SYNC_MINUTES } from "@/lib/erwin/sync-interval";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { isModuleOn } from "@/modules/state";

const LOG_SOURCE = "ErwinJobSyncRunner";

/**
 * Adaptive Canvas polling: when any open task is due within `hours` (spec: 48h → 30 min sync).
 */
async function hasOpenTaskDueWithinHours(
  userId: string,
  now: Date,
  hours: number
): Promise<boolean> {
  const horizon = new Date(now.getTime() + hours * 3_600_000);
  const n = await prisma.task.count({
    where: {
      userId,
      status: { not: "completed" },
      dueDate: { not: null, gte: now, lte: horizon },
    },
  });
  return n > 0;
}

/**
 * Ticks and syncs drift by seconds. Without slack, a 15-minute interval on a
 * 15-minute tick sees 14m59s since the last sync, skips, and really syncs
 * every other tick.
 */
const DUE_SLACK_MS = 2 * 60_000;

function isDue(last: Date | null, now: Date, intervalMs: number): boolean {
  return !last || now.getTime() - last.getTime() >= intervalMs - DUE_SLACK_MS;
}

function caldavPollIntervalMs(): number {
  const raw = process.env.ERWIN_CALDAV_POLL_INTERVAL_MINUTES;
  const mins = raw ? Number.parseInt(raw, 10) : 15;
  if (!Number.isFinite(mins) || mins < 1) {
    return 15 * 60_000;
  }
  return mins * 60_000;
}

export interface CanvasSyncRunStats {
  skipped: number;
  synced: number;
  failed: number;
}

export interface CaldavSyncRunStats {
  skipped: number;
  synced: number;
  failed: number;
}

/**
 * Syncs Canvas (gradebook, tasks, announcements, inbox, materials) for each
 * user whose CANVAS provider is due (see `syncIntervalMinutes`).
 */
export async function runPeriodicCanvasSyncs(): Promise<CanvasSyncRunStats> {
  const now = newDate();
  const providers = await prisma.taskProvider.findMany({
    where: {
      type: "CANVAS",
      enabled: true,
      syncEnabled: true,
      accessToken: { not: null },
      serverUrl: { not: null },
    },
  });

  let skipped = 0;
  let synced = 0;
  let failed = 0;

  for (const p of providers) {
    // Courses off means Canvas isn't read at all until it's back on.
    if (!(await isModuleOn(p.userId, "courses"))) {
      skipped += 1;
      continue;
    }
    const baseIntervalMin = p.syncIntervalMinutes ?? DEFAULT_CANVAS_SYNC_MINUTES;
    // Something due soon can only speed sync up: with the 15-minute default,
    // a flat 30 here slowed it down exactly when a deadline was close.
    const urgent48h = await hasOpenTaskDueWithinHours(p.userId, now, 48);
    const intervalMin = urgent48h ? Math.min(baseIntervalMin, 30) : baseIntervalMin;
    if (!isDue(p.lastSyncedAt, now, intervalMin * 60_000)) {
      skipped += 1;
      continue;
    }

    try {
      await syncCanvasForUser(p.userId);
      synced += 1;
      logger.info(
        "Canvas periodic sync OK",
        { userId: p.userId, providerId: p.id },
        LOG_SOURCE
      );
    } catch (error) {
      failed += 1;
      const msg =
        error instanceof Error ? error.message : String(error);
      logger.error(
        "Canvas periodic sync failed",
        { userId: p.userId, providerId: p.id, error: msg },
        LOG_SOURCE
      );
      await prisma.taskProvider.update({
        where: { id: p.id },
        data: { error: msg },
      });
    }
  }

  return { skipped, synced, failed };
}

/**
 * Syncs each enabled CalDAV feed whose last sync is older than the poll interval.
 */
export async function runPeriodicCaldavSyncs(): Promise<CaldavSyncRunStats> {
  const now = newDate();
  const pollMs = caldavPollIntervalMs();

  const feeds = await prisma.calendarFeed.findMany({
    where: {
      type: "CALDAV",
      enabled: true,
      url: { not: null },
      accountId: { not: null },
      userId: { not: null },
    },
    include: { account: true },
  });

  let skipped = 0;
  let synced = 0;
  let failed = 0;

  for (const feed of feeds) {
    if (!feed.account || !feed.url || !feed.userId) {
      skipped += 1;
      continue;
    }

    if (!isDue(feed.lastSync, now, pollMs)) {
      skipped += 1;
      continue;
    }

    try {
      const service = new CalDAVCalendarService(feed.account);
      await service.syncCalendar(feed.id, feed.url, feed.userId);
      await prisma.calendarFeed.update({
        where: { id: feed.id },
        data: { error: null },
      });
      synced += 1;
      logger.info(
        "CalDAV periodic sync OK",
        { feedId: feed.id, userId: feed.userId },
        LOG_SOURCE
      );
    } catch (error) {
      failed += 1;
      const msg =
        error instanceof Error ? error.message : String(error);
      logger.error(
        "CalDAV periodic sync failed",
        {
          feedId: feed.id,
          userId: feed.userId,
          error: msg,
        },
        LOG_SOURCE
      );
      await prisma.calendarFeed.update({
        where: { id: feed.id },
        data: { error: msg },
      });
    }
  }

  return { skipped, synced, failed };
}

/**
 * Runs Canvas then CalDAV periodic passes (single BullMQ tick).
 */
export async function runAllPeriodicErwinSyncs(): Promise<{
  canvas: CanvasSyncRunStats;
  caldav: CaldavSyncRunStats;
}> {
  const canvas = await runPeriodicCanvasSyncs();
  const caldav = await runPeriodicCaldavSyncs();
  logger.info(
    "Erwin periodic sync tick complete",
    {
      canvasSkipped: canvas.skipped,
      canvasSynced: canvas.synced,
      canvasFailed: canvas.failed,
      caldavSkipped: caldav.skipped,
      caldavSynced: caldav.synced,
      caldavFailed: caldav.failed,
    },
    LOG_SOURCE
  );
  return { canvas, caldav };
}
