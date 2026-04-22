import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import multipart from '@fastify/multipart';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { redis } from './lib/redis.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { registry } from './lib/metrics.js';

// Plugins
import requestContextPlugin from './plugins/requestContext.js';
import swaggerPlugin from './plugins/swagger.js';
import authPlugin from './plugins/auth.js';
import apiLoggerPlugin from './plugins/apiLogger.js';
import errorHandlerPlugin from './plugins/errorHandler.js';

// Routes
import { customerAuthRoutes } from './modules/customerAuth/customerAuth.routes.js';
import { astrologerAuthRoutes } from './modules/astrologerAuth/astrologerAuth.routes.js';
import { adminAuthRoutes } from './modules/adminAuth/adminAuth.routes.js';
import { customerRoutes } from './modules/customers/customers.routes.js';
import { astrologerRoutes } from './modules/astrologers/astrologers.routes.js';
import { walletRoutes } from './modules/wallet/wallet.routes.js';
import { webhookRoutes } from './modules/payments/payments.routes.js';
import { consultationRoutes } from './modules/consultations/consultations.routes.js';
import { contentRoutes } from './modules/content/content.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { adminPlugin } from './admin/index.js';
import { setupScheduler } from './jobs/scheduler.js';
import { startHoroscopeWorker } from './jobs/workers/horoscopeGeneration.worker.js';
import { customerUploadRoutes, astrologerUploadRoutes, adminUploadRoutes, localPresignUploadRoute } from './modules/uploads/uploadRoutes.js';
import { imageReoptimizeWorker } from './jobs/workers/imageReoptimize.worker.js';
import { env } from './config/env.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, // we use pino directly
    genReqId: () => uuidv4(),
    disableRequestLogging: true,
  });

  // ── Core plugins (order matters) ──────────────────────────────────────────
  await app.register(requestContextPlugin);
  await app.register(errorHandlerPlugin);

  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? [env.APP_BASE_URL, env.ADMIN_BASE_URL] : true,
    credentials: true,
  });

  await app.register(helmet, { global: true });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
    errorResponseBuilder: (_req, context) => ({
      ok: false,
      error: { code: 'RATE_LIMIT', message: `Rate limit exceeded. Retry after ${context.after}` },
    }),
  });

  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  });
  await app.register(authPlugin);
  await app.register(apiLoggerPlugin);
  await app.register(swaggerPlugin);

  // ── Static file serving for local storage provider ────────────────────────
  // Files under STORAGE_LOCAL_PATH/public/ are served at /uploads/public/*
  // without auth. S3/R2 providers serve files directly from their CDN.
  if (env.STORAGE_PROVIDER === 'local') {
    await app.register(staticFiles, {
      root: path.resolve(env.STORAGE_LOCAL_PATH),
      prefix: '/uploads/',
      decorateReply: false,
    });
    // Accept pre-signed PUT uploads in local dev (replaces S3 direct upload)
    await app.register(localPresignUploadRoute);
  }

  // ── Health & metrics ──────────────────────────────────────────────────────
  app.get('/health', { schema: { hide: true } }, async (_req, reply) => {
    return reply.send({ ok: true, version: env.APP_VERSION, env: env.NODE_ENV });
  });

  app.get('/metrics', { schema: { hide: true } }, async (_req, reply) => {
    const metrics = await registry.metrics();
    return reply.header('Content-Type', registry.contentType).send(metrics);
  });

  // ── Auth routes ───────────────────────────────────────────────────────────
  await app.register(customerAuthRoutes);
  await app.register(astrologerAuthRoutes);
  await app.register(adminAuthRoutes);

  // ── Persona routes ────────────────────────────────────────────────────────
  await app.register(customerRoutes);
  await app.register(astrologerRoutes);
  await app.register(walletRoutes);
  await app.register(consultationRoutes);

  // ── Payments webhook ──────────────────────────────────────────────────────
  await app.register(webhookRoutes);

  // ── Upload routes ─────────────────────────────────────────────────────────
  await app.register(customerUploadRoutes);
  await app.register(astrologerUploadRoutes);
  await app.register(adminUploadRoutes);

  // ── Public content + AI ───────────────────────────────────────────────────
  await app.register(contentRoutes);
  await app.register(aiRoutes);

  // ── Admin ─────────────────────────────────────────────────────────────────
  await app.register(adminPlugin);

  logger.info('All routes registered');

  // Start background workers and cron scheduler (idempotent — safe to call multiple times).
  startHoroscopeWorker();
  // imageReoptimizeWorker is imported for its side-effect (worker registration).
  void imageReoptimizeWorker;
  await setupScheduler();

  return app;
}
