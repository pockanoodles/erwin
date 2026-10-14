/**
 * How often background sync ticks, shared by both schedulers: the BullMQ
 * worker (`src/worker/worker.ts`, server installs with Redis) and the
 * in-process scheduler (`inprocess-scheduler.ts`, the desktop app and
 * single-container installs without Redis).
 *
 * `ERWIN_BACKGROUND_SYNC_INTERVAL_MS`, default 15 minutes, floor one minute.
 * Each tick only syncs what is due, so this is an upper bound on staleness,
 * not a fixed sync rate.
 */
export function getBackgroundIntervalMs(): number {
  const raw = process.env.ERWIN_BACKGROUND_SYNC_INTERVAL_MS;
  const v = raw ? Number.parseInt(raw, 10) : 900_000;
  if (!Number.isFinite(v) || v < 60_000) {
    return 900_000;
  }
  return v;
}
