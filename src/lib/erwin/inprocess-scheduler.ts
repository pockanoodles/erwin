/**
 * Background sync without Redis: a timer inside the Next server process.
 *
 * The BullMQ worker exists so a server install can run sync in its own
 * process and survive app restarts. The desktop app has no Redis and no
 * second process to give it, and a single-container self-host is the same
 * situation, so both opt in to this with `ERWIN_SCHEDULER=inprocess`. It runs
 * the exact function the worker runs, so the two never diverge.
 *
 * Started once from `instrumentation.ts`. Ticks never overlap: a slow Canvas
 * sync simply delays the next one.
 */

import { runAllPeriodicErwinSyncs } from "@/lib/erwin/job-sync-runner";
import { getBackgroundIntervalMs } from "@/lib/erwin/sync-interval";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ErwinInProcessScheduler";

/** Long enough for the window to load first; sync is never what you opened the app for. */
const FIRST_TICK_DELAY_MS = 20_000;

let started = false;

export function startInProcessScheduler(): void {
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
        "In-process sync tick failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    } finally {
      running = false;
    }
  };

  setTimeout(() => void tick(), FIRST_TICK_DELAY_MS);
  setInterval(() => void tick(), intervalMs);

  logger.info("In-process scheduler started", { intervalMs }, LOG_SOURCE);
}
