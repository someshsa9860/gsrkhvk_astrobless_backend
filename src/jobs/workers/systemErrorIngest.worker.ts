import { Worker } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../db/client.js';
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

    const existing = await prisma.systemError.findFirst({
      where: { fingerprint: data.fingerprint },
      select: { id: true, isResolved: true },
    });

    if (existing) {
      await prisma.systemError.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: new Date(),
          isResolved: false,
        },
      });
    } else {
      await prisma.systemError.create({
        data: {
          traceId: data.traceId ?? null,
          errorName: data.errorName,
          errorMessage: data.errorMessage,
          stackTrace: data.stackTrace ?? null,
          severity: data.severity,
          source: data.source,
          sourceDetail: data.sourceDetail ?? null,
          audience: data.audience ?? null,
          actorType: data.actorType ?? null,
          actorId: data.actorId ?? null,
          httpMethod: data.httpMethod ?? null,
          httpPath: data.httpPath ?? null,
          httpStatusCode: data.httpStatusCode ?? null,
          serverHostname: data.serverHostname ?? null,
          serverRegion: data.serverRegion ?? null,
          appVersion: data.appVersion ?? null,
          environment: data.environment,
          metadata: data.metadata ?? undefined,
          fingerprint: data.fingerprint,
          sentryEventId: data.sentryEventId ?? null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
    }
  }, { connection: redis });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'systemErrorIngest job failed');
  });

  return worker;
}
