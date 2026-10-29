/**
 * Courses' server side for the module registry (src/modules/server.ts): the
 * Canvas sync, run by the background sync loop for everyone with Courses on.
 */
import { syncCanvasForUser } from "@/lib/canvas/sync-canvas";
import { newDate } from "@/lib/date-utils";
import { DEFAULT_CANVAS_SYNC_MINUTES, isDue } from "@/lib/sigwald/sync-interval";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CoursesCanvasSync";

/** Adaptive polling: anything due within `hours` can only speed sync up. */
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
 * Syncs one person's Canvas (gradebook, tasks, announcements, inbox,
 * materials) when their provider is due (`syncIntervalMinutes`). A failure
 * is recorded on the provider, where Settings and ops' health check read it,
 * and rethrown for the sync loop to log.
 */
export async function syncCanvasIfDue(userId: string): Promise<boolean> {
  const provider = await prisma.taskProvider.findFirst({
    where: {
      userId,
      type: "CANVAS",
      enabled: true,
      syncEnabled: true,
      accessToken: { not: null },
      serverUrl: { not: null },
    },
  });
  if (!provider) return false;

  const now = newDate();
  const baseIntervalMin =
    provider.syncIntervalMinutes ?? DEFAULT_CANVAS_SYNC_MINUTES;
  // Something due soon can only speed sync up: with the 15-minute default,
  // a flat 30 here slowed it down exactly when a deadline was close.
  const urgent48h = await hasOpenTaskDueWithinHours(userId, now, 48);
  const intervalMin = urgent48h
    ? Math.min(baseIntervalMin, 30)
    : baseIntervalMin;
  if (!isDue(provider.lastSyncedAt, now, intervalMin * 60_000)) return false;

  try {
    await syncCanvasForUser(userId);
    logger.info(
      "Canvas periodic sync OK",
      { userId, providerId: provider.id },
      LOG_SOURCE
    );
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.taskProvider.update({
      where: { id: provider.id },
      data: { error: msg },
    });
    throw error;
  }
}
