// Prisma returns BigInt for bigint DB columns (money fields, viewCount, etc.).
// Fastify serializes responses with JSON.stringify, which can't handle BigInt.
// Patching prototype here — before any module loads — converts all BigInts to
// Number at serialization time. All money values fit safely in Number (< 2^53).
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function () {
  return Number(this);
};

import * as Sentry from '@sentry/node';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { redis, pubRedis, subRedis } from './lib/redis.js';
import { initChatGateway } from './modules/chat/chat.gateway.js';
import { startSystemErrorWorker } from './jobs/workers/systemErrorIngest.worker.js';
import { startTempCleanupWorker } from './jobs/workers/tempCleanup.worker.js';

// ── Sentry ────────────────────────────────────────────────────────────────
if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, release: env.APP_VERSION });
}

async function main(): Promise<void> {
  // Verify Redis is reachable (lazyConnect: true means connect happens on first command)
  await redis.ping();
  logger.info('Redis connections established');

  const app = await buildApp();
  const httpServer = app.server;

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  const io = initChatGateway(httpServer);
  logger.info('Socket.IO gateway initialized');

  // ── BullMQ workers ────────────────────────────────────────────────────────
  startSystemErrorWorker();
  startTempCleanupWorker();
  logger.info('BullMQ workers started');

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...');
    await app.close();
    io.close();
    await redis.quit();
    await pubRedis.quit();
    await subRedis.quit();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    Sentry.captureException(err);
    process.exit(1);
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, `${env.APP_NAME} backend started`);
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
