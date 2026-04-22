import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { systemErrorIngestQueue } from '../jobs/queues.js';
import { getContext } from '../lib/context.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { systemErrorsTotal } from '../lib/metrics.js';

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export type ErrorSource = 'httpRoute' | 'socketHandler' | 'bullmqJob' | 'scheduledTask' | 'webhook';

export interface ReportErrorInput {
  error: Error;
  severity?: ErrorSeverity;
  source: ErrorSource;
  sourceDetail?: string;
  httpMethod?: string;
  httpPath?: string;
  httpStatusCode?: number;
  metadata?: Record<string, unknown>;
}

export async function reportError(input: ReportErrorInput): Promise<void> {
  const severity = input.severity ?? 'error';
  const ctx = getContext();

  systemErrorsTotal.inc({ severity, source: input.source });
  logger.error({ traceId: ctx.traceId, err: input.error, source: input.source, sourceDetail: input.sourceDetail }, input.error.message);

  const fingerprint = computeFingerprint(input.error);

  const sentryId = Sentry.captureException(input.error, {
    tags: { source: input.source, audience: ctx.audience },
    extra: { traceId: ctx.traceId, ...input.metadata },
  });

  try {
    await systemErrorIngestQueue.add('ingest', {
      traceId: ctx.traceId,
      errorName: input.error.name,
      errorMessage: input.error.message,
      stackTrace: input.error.stack,
      severity,
      source: input.source,
      sourceDetail: input.sourceDetail,
      audience: ctx.audience,
      actorType: ctx.actorType,
      actorId: ctx.actorId,
      httpMethod: input.httpMethod,
      httpPath: input.httpPath,
      httpStatusCode: input.httpStatusCode,
      serverHostname: process.env['HOSTNAME'] ?? 'local',
      serverRegion: env.REGION,
      appVersion: env.APP_VERSION,
      environment: env.NODE_ENV,
      metadata: input.metadata,
      fingerprint,
      sentryEventId: sentryId,
    });
  } catch (queueErr) {
    logger.error({ err: queueErr }, 'Failed to enqueue system error');
  }
}

function computeFingerprint(error: Error): string {
  const frames = (error.stack ?? error.message)
    .split('\n')
    .slice(0, 5)
    .map((l) => l.replace(/:\d+:\d+/g, ':X:X'))
    .join('\n');
  return crypto.createHash('sha1').update(`${error.name}:${frames}`).digest('hex');
}
