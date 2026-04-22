/**
 * Temp file cleanup worker.
 *
 * Runs weekly (Sunday 02:00 UTC). Deletes all temp/{date}/... objects where
 * date < 7 days ago. Temp files that were never finalized (user abandoned upload)
 * are cleaned up automatically, so storage doesn't accumulate stale uploads.
 *
 * Key format: temp/{YYYY-MM-DD}/{category}/{userId}/{uuid}/original.{ext}
 */

import { Worker } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { getStorage } from '../../lib/storage/index.js';
import { logger } from '../../lib/logger.js';
import { reportError } from '../../observability/errorReporter.js';

export function startTempCleanupWorker(): Worker {
  const worker = new Worker(
    'tempCleanup',
    async (job) => {
      const storage = getStorage();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      logger.info({ cutoff: cutoffDate.toISOString() }, '[tempCleanup] starting temp file cleanup');

      // List all keys under temp/
      const allTempKeys = await storage.listKeys('temp/');

      let deleted = 0;
      let skipped = 0;
      let errors = 0;

      for (const key of allTempKeys) {
        try {
          const date = extractDateFromTempKey(key);
          if (!date) {
            skipped++;
            continue;
          }
          if (date < cutoffDate) {
            await storage.delete(key);
            deleted++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
          logger.warn({ key, err }, '[tempCleanup] failed to delete key');
        }
      }

      logger.info({ deleted, skipped, errors, total: allTempKeys.length }, '[tempCleanup] completed');
      return { deleted, skipped, errors };
    },
    { connection: redis },
  );

  worker.on('failed', async (job, err) => {
    await reportError({
      error: err,
      source: 'bullmqJob',
      sourceDetail: 'tempCleanup',
      severity: 'error',
      metadata: { jobId: job?.id },
    });
  });

  return worker;
}

/**
 * Extract the date portion from a temp key.
 * temp/{YYYY-MM-DD}/{category}/... → Date
 */
function extractDateFromTempKey(key: string): Date | null {
  const parts = key.split('/');
  // parts[0] = 'temp', parts[1] = 'YYYY-MM-DD'
  if (parts.length < 3 || parts[0] !== 'temp') return null;
  const dateStr = parts[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}
