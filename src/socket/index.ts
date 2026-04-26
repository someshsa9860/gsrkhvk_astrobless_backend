// Standalone Socket.IO process — handles all real-time connections.
// Started with: node dist/socket/index.js
// Shares Redis pub/sub adapter with API containers for cross-instance fan-out.
// Does NOT handle REST routes.

(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function () {
  return Number(this);
};

import * as Sentry from '@sentry/node';
import http from 'node:http';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { redis, pubRedis, subRedis } from '../lib/redis.js';
import { initChatGateway } from '../modules/chat/chat.gateway.js';
import { initPresenceGateway } from '../modules/presence/presence.gateway.js';

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, release: env.APP_VERSION });
}

const SOCKET_PORT = Number(process.env['SOCKET_PORT'] ?? 3001);

async function main(): Promise<void> {
  await redis.ping();
  logger.info('Socket: Redis connections established');

  // Minimal HTTP server — Socket.IO needs an http.Server to attach to.
  // This server only serves the Socket.IO handshake; no REST routes.
  const httpServer = http.createServer((_req, res) => {
    if (_req.url === '/health') {
      res.writeHead(200);
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = initChatGateway(httpServer);
  logger.info('Socket: chat gateway initialized (Redis adapter attached)');

  initPresenceGateway(io);
  logger.info('Socket: presence gateway initialized on /presence namespace');

  httpServer.listen(SOCKET_PORT, '0.0.0.0', () => {
    logger.info({ port: SOCKET_PORT }, 'Socket: server listening');
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Socket: shutting down...');
    io.close();
    httpServer.close();
    await redis.quit();
    await pubRedis.quit();
    await subRedis.quit();
    logger.info('Socket: graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Socket: unhandled promise rejection');
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Socket: uncaught exception');
    Sentry.captureException(err);
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Socket: fatal startup error');
  process.exit(1);
});
