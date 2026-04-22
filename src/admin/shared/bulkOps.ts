// Generic bulk-operation executor — processes items with controlled concurrency,
// collects per-item results, and never lets one failure abort the whole batch.

import pLimit from 'p-limit';
import { logger } from '../../lib/logger.js';

export interface BulkResult<T, R> {
  succeeded: R[];
  failed: Array<{ item: T; error: string }>;
}

interface BulkOptions {
  // How many concurrent operations to run — keep low for DB-heavy ops (2–5).
  concurrency: number;
  // Audit action name logged at the end (each item is audited by the individual op).
  auditAction: string;
}

// Run `operation` for each item, gather successes + failures, return both.
export async function executeBulk<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  options: BulkOptions,
): Promise<BulkResult<T, R>> {
  const limit = pLimit(options.concurrency);
  const succeeded: R[] = [];
  const failed: Array<{ item: T; error: string }> = [];

  await Promise.all(
    items.map((item) =>
      limit(async () => {
        try {
          const result = await operation(item);
          succeeded.push(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ err, item, auditAction: options.auditAction }, 'Bulk op item failed');
          failed.push({ item, error: message });
        }
      }),
    ),
  );

  logger.info(
    { action: options.auditAction, total: items.length, succeeded: succeeded.length, failed: failed.length },
    'Bulk operation finished',
  );

  return { succeeded, failed };
}
