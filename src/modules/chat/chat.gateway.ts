import type { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis, pubRedis, subRedis } from '../../lib/redis.js';
import { verifyAccessToken } from '../../lib/jwt.js';
import { setSocketEmitter } from '../consultations/consultations.service.js';
import { db } from '../../db/client.js';
import * as consultRepo from '../consultations/consultations.repository.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { sendPush } from '../notifications/notifications.service.js';
import { prisma } from '../../db/client.js';
import type { Audience } from '../../lib/context.js';

let io: SocketServer | null = null;

export function initChatGateway(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  io.adapter(createAdapter(pubRedis, subRedis));

  // ── Auth handshake ─────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token) return next(new Error('AUTH_REQUIRED'));

    for (const audience of [JWT_AUDIENCE.CUSTOMER, JWT_AUDIENCE.ASTROLOGER] as Audience[]) {
      try {
        const payload = await verifyAccessToken(token, audience);
        socket.data['sub'] = payload.sub;
        socket.data['audience'] = audience;
        socket.data['actorType'] = audience === JWT_AUDIENCE.CUSTOMER ? 'customer' : 'astrologer';
        return next();
      } catch {
        // try next audience
      }
    }
    return next(new Error('INVALID_TOKEN'));
  });

  // ── Consultation namespace ────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const actorType = socket.data['actorType'] as string;
    const sub = socket.data['sub'] as string;

    // Auto-join personal room
    socket.join(`${actorType}:${sub}`);

    socket.on('consultation:join', ({ consultationId }: { consultationId: string }) => {
      socket.join(`consultation:${consultationId}`);
    });

    socket.on('consultation:leave', ({ consultationId }: { consultationId: string }) => {
      socket.leave(`consultation:${consultationId}`);
    });

    socket.on('message:send', async (data: {
      consultationId: string;
      type: string;
      body?: string;
      mediaUrl?: string;
      clientMsgId: string;
    }) => {
      const eventId = uuidv4();
      try {
        const msg = await consultRepo.insertMessage({
          consultationId: data.consultationId,
          senderType: actorType,
          senderId: sub,
          type: data.type,
          body: data.body,
          mediaUrl: data.mediaUrl,
          clientMsgId: data.clientMsgId,
        });

        socket.to(`consultation:${data.consultationId}`).emit('message:new', { message: msg, eventId });
        socket.emit('message:ack', { clientMsgId: data.clientMsgId, serverId: msg.id, createdAt: msg.createdAt });
      } catch (err) {
        logger.error({ err, consultationId: data.consultationId }, 'Socket message:send error');
      }
    });

    socket.on('typing:start', ({ consultationId }: { consultationId: string }) => {
      socket.to(`consultation:${consultationId}`).emit('typing:update', { consultationId, senderType: actorType, senderId: sub, isTyping: true });
    });

    socket.on('typing:stop', ({ consultationId }: { consultationId: string }) => {
      socket.to(`consultation:${consultationId}`).emit('typing:update', { consultationId, senderType: actorType, senderId: sub, isTyping: false });
    });

    socket.on('message:read', ({ consultationId, upToMessageId }: { consultationId: string; upToMessageId: string }) => {
      socket.to(`consultation:${consultationId}`).emit('message:read', { consultationId, upToMessageId, readerType: actorType, readerId: sub });
    });

    // ── Presence namespace (astrologers only) ──────────────────────────────
    // On connect: if astrologer was previously manually online, restore that state
    if (actorType === 'astrologer') {
      void (async () => {
        const raw = await redis.get(`presence:astrologer:${sub}`);
        if (raw) {
          try {
            const cached = JSON.parse(raw) as { isOnline: boolean; isBusy: boolean; manualOffline?: boolean };
            // Only auto-restore if they didn't manually go offline
            if (cached.isOnline && !cached.manualOffline) {
              io?.emit('presence:update', { astrologerId: sub, isOnline: true, isBusy: cached.isBusy ?? false });
              await prisma.astrologer.update({ where: { id: sub }, data: { isOnline: true } });
              logger.debug({ sub }, 'Astrologer auto-restored online on reconnect');
            }
          } catch {
            // ignore stale parse error
          }
        }
      })();
    }

    // Astrologer emits presence:set { isOnline, isBusy } to broadcast status
    socket.on('presence:set', ({ isOnline, isBusy }: { isOnline: boolean; isBusy: boolean }) => {
      if (actorType !== 'astrologer') {
        logger.warn({ sub }, 'Non-astrologer attempted presence:set');
        return;
      }
      // Broadcast to all connected clients
      io?.emit('presence:update', { astrologerId: sub, isOnline, isBusy });
      // Store in Redis — manualOffline=true when astrologer explicitly goes offline
      // so a reconnect does NOT auto-restore them
      void pubRedis.set(
        `presence:astrologer:${sub}`,
        JSON.stringify({ isOnline, isBusy, manualOffline: !isOnline, updatedAt: new Date().toISOString() }),
        'EX',
        86400, // 24h — keep manual-offline preference across app restarts
      );
      // Persist to DB
      void prisma.astrologer.update({ where: { id: sub }, data: { isOnline, updatedAt: new Date() } }).catch(() => {});

      // Notify followers via FCM (fire-and-forget)
      void notifyFollowersOfPresence(sub, isOnline).catch(() => {});

      // If going offline manually, send a reminder FCM after 30 min of inactivity
      if (!isOnline) {
        void scheduleOfflineReminder(sub);
      } else {
        void cancelOfflineReminder(sub);
      }
    });

    socket.on('disconnect', () => {
      if (actorType === 'astrologer') {
        // Network disconnect (NOT manual): mark offline in Redis but preserve manualOffline=false
        // so next reconnect auto-restores online
        void (async () => {
          const raw = await redis.get(`presence:astrologer:${sub}`);
          let isBusy = false;
          let wasManualOffline = false;
          if (raw) {
            try {
              const cached = JSON.parse(raw) as { isOnline: boolean; isBusy: boolean; manualOffline?: boolean };
              isBusy = cached.isBusy ?? false;
              wasManualOffline = cached.manualOffline ?? false;
            } catch { /* ignore */ }
          }
          // Broadcast offline to customers
          io?.emit('presence:update', { astrologerId: sub, isOnline: false, isBusy: false });
          // Keep presence key with manualOffline=false (network drop, not manual)
          // so on reconnect they auto-restore if they were online
          if (!wasManualOffline) {
            await pubRedis.set(
              `presence:astrologer:${sub}`,
              JSON.stringify({ isOnline: false, isBusy, manualOffline: false, updatedAt: new Date().toISOString() }),
              'EX',
              3600, // 1h window to reconnect and auto-restore
            );
          }
          // Update DB
          void prisma.astrologer.update({ where: { id: sub }, data: { isOnline: false } }).catch(() => {});
        })();
      }
      logger.debug({ sub, actorType }, 'Socket disconnected');
    });
  });

  // ── Admin dashboard namespace ───────────────────────────────────────────
  const adminNs = io.of('/admin/dashboard');
  adminNs.use(async (socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token) return next(new Error('AUTH_REQUIRED'));

    try {
      const payload = await verifyAccessToken(token, JWT_AUDIENCE.ADMIN);
      socket.data['adminId'] = payload.sub;
      socket.data['role'] = payload.role;
      return next();
    } catch {
      return next(new Error('INVALID_TOKEN'));
    }
  });

  adminNs.on('connection', (socket) => {
    logger.debug({ adminId: socket.data['adminId'] }, 'Admin dashboard connected');

    socket.on('disconnect', () => {
      logger.debug({ adminId: socket.data['adminId'] }, 'Admin dashboard disconnected');
    });
  });

  // Wire emitter into consultations service
  setSocketEmitter((room, event, data) => {
    io?.to(room).emit(event, data);
  });

  return io;
}

export function getSocketServer(): SocketServer | null {
  return io;
}

// ── Customer FCM on astrologer presence change ───────────────────────────────

async function notifyFollowersOfPresence(astrologerId: string, isOnline: boolean): Promise<void> {
  if (!isOnline) return; // Only notify when going online (avoid spam on offline)

  // Get followers who have notifications enabled
  const followers = await prisma.astrologerFollower.findMany({
    where: { astrologerId },
    select: { customerId: true },
    take: 500, // Cap to avoid huge fan-outs; most astrologers have far fewer followers
  });

  if (followers.length === 0) return;

  const astrologer = await prisma.astrologer.findFirst({
    where: { id: astrologerId },
    select: { displayName: true },
  });
  const name = astrologer?.displayName ?? 'Your astrologer';

  // Send FCM to each follower topic (topic = customerId)
  await Promise.allSettled(
    followers.map(({ customerId }) =>
      sendPush('customer', customerId, `${name} is now online 🟢`, 'Tap to start a consultation now!', {
        type: 'astrologerOnline',
        astrologerId,
      }),
    ),
  );
}

// ── Offline reminder helpers ─────────────────────────────────────────────────

const offlineReminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleOfflineReminder(astrologerId: string): void {
  cancelOfflineReminder(astrologerId);
  const timer = setTimeout(async () => {
    offlineReminderTimers.delete(astrologerId);
    // Only send reminder if still offline (manual)
    const raw = await redis.get(`presence:astrologer:${astrologerId}`).catch(() => null);
    if (!raw) return;
    try {
      const cached = JSON.parse(raw) as { isOnline: boolean; manualOffline?: boolean };
      if (!cached.isOnline && cached.manualOffline) {
        void sendPush(
          'astrologer',
          astrologerId,
          'You are offline 🌙',
          'Customers are looking for you! Go online to start earning.',
          { type: 'presenceReminder' },
        ).catch(() => {});
      }
    } catch { /* ignore */ }
  }, 30 * 60 * 1000); // 30 minutes
  offlineReminderTimers.set(astrologerId, timer);
}

function cancelOfflineReminder(astrologerId: string): void {
  const existing = offlineReminderTimers.get(astrologerId);
  if (existing) {
    clearTimeout(existing);
    offlineReminderTimers.delete(astrologerId);
  }
}
