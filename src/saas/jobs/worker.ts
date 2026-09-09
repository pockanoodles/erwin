/**
 * BullMQ worker: periodic Canvas + CalDAV sync for all eligible users/feeds.
 *
 * Requires `REDIS_URL`. Interval: `ERWIN_BACKGROUND_SYNC_INTERVAL_MS` (default 15 minutes).
 */

import "./load-env";
import "./register-alias";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { runAllPeriodicErwinSyncs } from "@/lib/erwin/job-sync-runner";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ErwinBullWorker";

const QUEUE_NAME = "erwin-periodic-sync";
const SCHEDULER_ID = "erwin-periodic-sync-scheduler";
const JOB_NAME = "run-erwin-syncs";

function redisPreview(url: string | undefined): string {
  if (!url) {
    return "(unset)";
  }
  if (url.includes("@")) {
    return url.split("@").slice(-1)[0] ?? "(hidden)";
  }
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "6379"}`;
  } catch {
    return "(configured)";
  }
}

function getBackgroundIntervalMs(): number {
  const raw = process.env.ERWIN_BACKGROUND_SYNC_INTERVAL_MS;
  const v = raw ? Number.parseInt(raw, 10) : 900_000;
  if (!Number.isFinite(v) || v < 60_000) {
    return 900_000;
  }
  return v;
}

function createConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set (required for BullMQ Erwin worker)"
    );
  }
  return new IORedis(url, { maxRetriesPerRequest: null });
}

async function main(): Promise<void> {
  const connection = createConnection();
  const intervalMs = getBackgroundIntervalMs();

  const queue = new Queue(QUEUE_NAME, { connection });

  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: intervalMs },
    {
      name: JOB_NAME,
      data: {},
      opts: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      },
    }
  );

  logger.info(
    "Erwin BullMQ worker starting",
    {
      queue: QUEUE_NAME,
      intervalMs,
      redisHostPreview: redisPreview(process.env.REDIS_URL),
    },
    LOG_SOURCE
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runAllPeriodicErwinSyncs();
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      "Erwin periodic job failed",
      {
        jobId: job?.id ?? "",
        error: err instanceof Error ? err.message : String(err),
      },
      LOG_SOURCE
    );
  });

  const shutdown = async (signal: string) => {
    logger.info(`Erwin worker ${signal}, closing…`, {}, LOG_SOURCE);
    await worker.close();
    await queue.close();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error(
    "Erwin worker fatal",
    { error: err instanceof Error ? err.message : String(err) },
    LOG_SOURCE
  );
  process.exit(1);
});
