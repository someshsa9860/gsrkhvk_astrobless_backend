// /presence Socket.IO namespace — tracks astrologer online/offline status in real-time.
// Astrologers connect here on app open and disconnect on app close.
// Emits presence:update to all subscribers (customers browsing, admin dashboard).
// Redis SET tracks a heartbeat TTL so stale sockets are detected and cleaned up.

import type { Server as SocketServer } from 'socket.io';
import { verifyAccessToken } from '../../lib/jwt.js';
import { redis } from '../../lib/redis.js';
import { prisma } from '../../db/client.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';

const PRESENCE_KEY = (astrologerId: string) => `presence:astrologer:${astrologerId}`;
// Key expires after 90s; heartbeat must be sent every 60s to keep alive
const PRESENCE_TTL_SECONDS = 90;

export function initPresenceGateway(io: SocketServer): void {
  const ns = io.of('/presence');

  ns.use(async (socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token) return next(new Error('AUTH_REQUIRED'));

    // Accept both astrologer and customer/admin tokens.
    // Astrologers manage their own presence; customers/admin subscribe to updates.
    const audiences = [JWT_AUDIENCE.ASTROLOGER, JWT_AUDIENCE.CUSTOMER, JWT_AUDIENCE.ADMIN];
    for (const audience of audiences) {
      try {
        const payload = await verifyAccessToken(token, audience);
        socket.data['sub']      = payload.sub;
        socket.data['audience'] = audience;
        return next();
      } catch {
        // try next
      }
    }
    return next(new Error('INVALID_TOKEN'));
  });

  ns.on('connection', async (socket) => {
    const audience     = socket.data['audience'] as string;
    const sub          = socket.data['sub']      as string;
    const isAstrologer = audience === JWT_AUDIENCE.ASTROLOGER;

    if (isAstrologer) {
      // Mark astrologer as online
      await _setOnline(sub, socket.id);

      // Broadcast presence update to all namespace subscribers
      ns.emit('presence:update', { astrologerId: sub, isOnline: true, timestamp: new Date().toISOString() });

      // Astrologer can explicitly go "invisible" (online in app but marked offline for customers)
      socket.on('presence:invisible', async () => {
        await _setOffline(sub);
        ns.emit('presence:update', { astrologerId: sub, isOnline: false, timestamp: new Date().toISOString() });
      });

      // Heartbeat: reset TTL every 60s
      socket.on('presence:heartbeat', async () => {
        await redis.expire(PRESENCE_KEY(sub), PRESENCE_TTL_SECONDS);
        socket.emit('presence:heartbeat:ack', { ts: Date.now() });
      });

      // Fetch list of currently online astrologers on demand
      socket.on('presence:list', async (_, callback) => {
        if (typeof callback !== 'function') return;
        try {
          const onlineIds = await _getOnlineIds();
          callback({ ok: true, data: onlineIds });
        } catch (err) {
          callback({ ok: false, error: 'INTERNAL' });
        }
      });

      socket.on('disconnect', async (reason) => {
        logger.debug({ sub, reason }, '[Presence] astrologer disconnected');
        // Only mark offline if no other socket for this astrologer exists
        const sockets = await ns.fetchSockets();
        const stillConnected = sockets.some(
          (s) => s.data['sub'] === sub && s.id !== socket.id
        );
        if (!stillConnected) {
          await _setOffline(sub);
          ns.emit('presence:update', { astrologerId: sub, isOnline: false, timestamp: new Date().toISOString() });
        }
      });
    } else {
      // Customer / admin: subscribe only — they receive presence:update broadcasts
      // and can request snapshot of online astrologers
      socket.on('presence:list', async (_, callback) => {
        if (typeof callback !== 'function') return;
        try {
          const onlineIds = await _getOnlineIds();
          callback({ ok: true, data: onlineIds });
        } catch (err) {
          callback({ ok: false, error: 'INTERNAL' });
        }
      });

      socket.on('disconnect', () => {
        logger.debug({ sub, audience }, '[Presence] subscriber disconnected');
      });
    }
  });

  logger.info('[Presence] gateway initialized on /presence namespace');
}

async function _setOnline(astrologerId: string, socketId: string): Promise<void> {
  await redis.set(PRESENCE_KEY(astrologerId), socketId, 'EX', PRESENCE_TTL_SECONDS);
  await prisma.astrologer.update({ where: { id: astrologerId }, data: { isOnline: true } }).catch(() => {});
  await writeAuditLog({
    actorType: 'astrologer', actorId: astrologerId,
    action: 'astrologer.presenceChange',
    summary: 'Astrologer came online (socket connect)',
    afterState: { isOnline: true },
  }).catch(() => {});
}

async function _setOffline(astrologerId: string): Promise<void> {
  await redis.del(PRESENCE_KEY(astrologerId));
  await prisma.astrologer.update({ where: { id: astrologerId }, data: { isOnline: false } }).catch(() => {});
  await writeAuditLog({
    actorType: 'astrologer', actorId: astrologerId,
    action: 'astrologer.presenceChange',
    summary: 'Astrologer went offline (socket disconnect)',
    afterState: { isOnline: false },
  }).catch(() => {});
}

async function _getOnlineIds(): Promise<string[]> {
  // Use DB as source of truth (Redis may lag on restart)
  const rows = await prisma.astrologer.findMany({
    where: { isOnline: true, isBlocked: false },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
