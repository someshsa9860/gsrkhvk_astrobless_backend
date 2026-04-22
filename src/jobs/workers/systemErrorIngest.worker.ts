import { Worker } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { redis } from '../../lib/redis.js';
import { db } from '../../db/client.js';
import { systemErrors } from '../../db/schema/observability.js';
import { logger } from '../../lib/logger.js';

export function startSystemErrorWorker(): Worker {
  const worker = new Worker('systemErrorIngest', async (job) => {
    const data = job.data as {
      fingerprint: string;
      traceId?: string;
      errorName: string;
      errorMessage: string;
      stackTrace?: string;
      severity: string;
      source: string;
      sourceDetail?: string;
      audience?: string;
      actorType?: string;
      actorId?: string;
      httpMethod?: string;
      httpPath?: string;
      httpStatusCode?: number;
      serverHostname?: string;
      serverRegion?: string;
      appVersion?: string;
      environment: string;
      metadata?: Record<string, unknown>;
      sentryEventId?: string;
    };

    const existing = await db.query.systemErrors.findFirst({
      where: eq(systemErrors.fingerprint, data.fingerprint),
      columns: { id: true, isResolved: true },
    });

    if (existing) {
      await db.update(systemErrors)
        .set({
          occurrenceCount: sql`${systemErrors.occurrenceCount} + 1`,
          lastSeenAt: new Date(),
          isResolved: false, // reopen if previously resolved
        })
        .where(eq(systemErrors.id, existing.id));
    } else {
      await db.insert(systemErrors).values({
        traceId: data.traceId,
        errorName: data.errorName,
        errorMessage: data.errorMessage,
        stackTrace: data.stackTrace,
        severity: data.severity,
        source: data.source,
        sourceDetail: data.sourceDetail,
        audience: data.audience,
        actorType: data.actorType,
        actorId: data.actorId,
        httpMethod: data.httpMethod,
        httpPath: data.httpPath,
        httpStatusCode: data.httpStatusCode,
        serverHostname: data.serverHostname,
        serverRegion: data.serverRegion,
        appVersion: data.appVersion,
        environment: data.environment,
        metadata: data.metadata ?? null,
        fingerprint: data.fingerprint,
        sentryEventId: data.sentryEventId,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      });
    }
  }, { connection: redis });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'systemErrorIngest job failed');
  });

  return worker;
}
