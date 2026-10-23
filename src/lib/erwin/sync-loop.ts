/**
 * Background sync: one timer, wherever it runs.
 *
 * Canvas and CalDAV sync on a plain interval, in one of two places. The
 * worker process (`src/worker/worker.ts`) runs it so a server install syncs
 * outside the web server and through app restarts. The desktop app and a
 * single-container install have no second process to give it, so they opt in
 * to running it inside the Next server with `ERWIN_SCHEDULER=inprocess`
 * (`instrumentation.ts`). Run one or the other, never both, or every sync
 * happens twice.
 *
 * Until 2026-10-22 the worker scheduled through BullMQ on Redis. Its job
 * scheduler could stop for good after a restart that landed within one
 * interval of the last run, which silently ended background sync, and a
 * single-user app gains nothing from a distributed queue. A timer can't lose
 * its schedule. Ticks never overlap: a slow sync simply delays the next one,
 * and each tick only syncs what is due (`job-sync-runner.ts`).
 */

import { runAllPeriodicErwinSyncs } from "@/lib/erwin/job-sync-runner";
import { getBackgroundIntervalMs } from "@/lib/erwin/sync-interval";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ErwinSyncLoop";

let started = false;

export function startSyncLoop(options: {
  /** Names the process in logs: "worker" or "in-process". */
  where: string;
  /** In the app, long enough for the window to load first; sync is never what you opened it for. */
  firstTickDelayMs: number;
}): void {
  if (started) {
    return;
  }
  started = true;

  const intervalMs = getBackgroundIntervalMs();
  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await runAllPeriodicErwinSyncs();
    } catch (error) {
      logger.error(
        "Background sync tick failed",
        { where: options.where, error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    } finally {
      running = false;
    }
  };

  setTimeout(() => void tick(), options.firstTickDelayMs);
  setInterval(() => void tick(), intervalMs);

  logger.info("Background sync loop started", { where: options.where, intervalMs }, LOG_SOURCE);
}
