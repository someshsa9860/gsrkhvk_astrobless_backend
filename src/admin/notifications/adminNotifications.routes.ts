// Admin real-time SSE stream — sends live platform events to the admin panel.
// The Next.js proxy at /api/admin-ws forwards this to the browser.

import type { FastifyPluginAsync } from 'fastify';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';

// Global registry of active SSE clients — keyed by admin id for targeted events.
const clients = new Map<string, Set<(data: string) => void>>();

// Emit a structured SSE event to all connected admin clients.
export function broadcastAdminEvent(eventType: string, data: unknown): void {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  let totalClients = 0;
  for (const senders of clients.values()) {
    for (const send of senders) {
      send(payload);
      totalClients++;
    }
  }
  if (totalClients > 0) {
    logger.debug({ eventType, totalClients }, 'Admin SSE event broadcast');
  }
}

export const adminNotificationsRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/notifications/stream', {
    schema: {
      tags: ['admin:notifications'],
      summary: 'Real-time admin SSE stream',
      description: 'Server-Sent Events stream for live admin dashboard events: new signups, new consultations, critical errors.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience],
    handler: async (req, reply) => {
      const adminId = (req as { user?: { sub?: string } }).user?.sub ?? 'unknown';

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial connected event
      reply.raw.write(`event: connected\ndata: {"status":"connected"}\n\n`);

      const send = (data: string) => {
        if (!reply.raw.writableEnded) reply.raw.write(data);
      };

      // Register this client
      if (!clients.has(adminId)) clients.set(adminId, new Set());
      clients.get(adminId)!.add(send);

      // Heartbeat every 25s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        if (reply.raw.writableEnded) { clearInterval(heartbeat); return; }
        reply.raw.write(': heartbeat\n\n');
      }, 25_000);

      req.raw.on('close', () => {
        clearInterval(heartbeat);
        clients.get(adminId)?.delete(send);
        if (clients.get(adminId)?.size === 0) clients.delete(adminId);
      });

      // Keep the handler alive — Fastify won't close the response
      await new Promise<void>((resolve) => req.raw.on('close', resolve));
    },
  });
};
