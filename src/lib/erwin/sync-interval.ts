/**
 * How often background sync ticks (`sync-loop.ts`), whether the loop runs in
 * the worker process or inside the app.
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

/**
 * How often a Canvas provider syncs unless its row says otherwise. Every
 * background tick, by default: a new announcement, file or grade shouldn't wait
 * hours to show up. Matches the schema default on `TaskProvider`.
 */
export const DEFAULT_CANVAS_SYNC_MINUTES = 15;
