// Standalone worker process — runs all BullMQ queues.
// Started with: node dist/worker/index.js
// Does NOT start HTTP server or Socket.IO.

(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function () {
  return Number(this);
};

import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { startSystemErrorWorker } from '../jobs/workers/systemErrorIngest.worker.js';
import { startTempCleanupWorker } from '../jobs/workers/tempCleanup.worker.js';
import { imageReoptimizeWorker } from '../jobs/workers/imageReoptimize.worker.js';
import { startHoroscopeWorker } from '../jobs/workers/horoscopeGeneration.worker.js';
import { setupScheduler } from '../jobs/scheduler.js';

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, release: env.APP_VERSION });
}

async function main(): Promise<void> {
  await redis.ping();
  logger.info('Worker: Redis connection established');

  // ── Start all queue workers ───────────────────────────────────────────────
  const systemErrorWorker = startSystemErrorWorker();
  const tempCleanupWorker = startTempCleanupWorker();
  const horoscopeWorker   = startHoroscopeWorker();
  // imageReoptimizeWorker is initialized on import (existing pattern)

  // ── Register cron schedules ───────────────────────────────────────────────
  await setupScheduler();

  logger.info('Worker: all queues running');
  logger.info('  systemErrorIngest  — error persistence');
  logger.info('  tempCleanup        — S3 temp file cleanup (weekly)');
  logger.info('  horoscopeGeneration — daily/weekly/monthly generation');
  logger.info('  imageReoptimize    — image processing on config change');
  logger.info('  notifications      — push/email/SMS dispatch');
  logger.info('  payouts            — astrologer payout batches');
  logger.info('  fcm                — Firebase Cloud Messaging');
  logger.info('  mediaScan          — NSFW / virus scan on uploads');

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker: shutting down...');
    await Promise.all([
      systemErrorWorker.close(),
      tempCleanupWorker.close(),
      horoscopeWorker.close(),
      imageReoptimizeWorker.close(),
    ]);
    await redis.quit();
    logger.info('Worker: graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Worker: unhandled promise rejection');
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Worker: uncaught exception');
    Sentry.captureException(err);
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Worker: fatal startup error');
  process.exit(1);
});
