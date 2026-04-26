// API-only entry point — Fastify REST server.
// Socket.IO runs in a separate container (src/socket/index.ts).
// BullMQ workers run in a separate container (src/worker/index.ts).

(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function () {
  return Number(this);
};

import * as Sentry from '@sentry/node';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, release: env.APP_VERSION });
}

async function main(): Promise<void> {
  await redis.ping();
  logger.info('API: Redis connection established');

  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'API: shutting down...');
    await app.close();
    await redis.quit();
    logger.info('API: graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'API: unhandled promise rejection');
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'API: uncaught exception');
    Sentry.captureException(err);
    process.exit(1);
  });

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, `${env.APP_NAME} API started`);
}

main().catch((err) => {
  logger.error({ err }, 'API: fatal startup error');
  process.exit(1);
});
