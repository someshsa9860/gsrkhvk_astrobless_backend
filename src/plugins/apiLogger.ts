import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger.js';
import { httpRequestsTotal, httpRequestDuration, httpInFlight } from '../lib/metrics.js';
import { env } from '../config/env.js';

const SENSITIVE_PATHS = ['password', 'passwordHash', 'otp', 'otpCode', 'cvv', 'cardNumber', 'token', 'refreshToken', 'accessToken', 'kycDocsRef', 'totpSecret', 'privateKey', 'secret'];

function redactSensitive(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_PATHS.includes(key) ? '[REDACTED]' : redactSensitive(value);
  }
  return result;
}

const apiLoggerPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', (_req, _reply, done) => {
    httpInFlight.inc();
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    httpInFlight.dec();

    const ctx = req.requestContext;
    const durationMs = reply.elapsedTime;
    const route = (req.routeOptions?.url as string | undefined) ?? req.url;
    const audience = ctx?.audience?.split('.')[1];
    const statusCode = reply.statusCode;

    httpRequestsTotal.inc({ method: req.method, route, status: String(statusCode), audience: audience ?? 'public' });
    httpRequestDuration.observe({ method: req.method, route }, durationMs / 1000);

    logger.info({
      type: 'apiLog',
      logId: uuidv4(),
      traceId: ctx?.traceId,
      method: req.method,
      path: req.url,
      routeTemplate: route,
      statusCode,
      durationMs,
      audience,
      actorId: ctx?.actorId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      appVersion: ctx?.appVersion,
      platform: ctx?.platform,
      serverHostname: process.env['HOSTNAME'] ?? 'local',
      region: env.REGION,
      environment: env.NODE_ENV,
    });

    done();
  });
};

export { redactSensitive };
export default fp(apiLoggerPlugin, { name: 'apiLogger' });
