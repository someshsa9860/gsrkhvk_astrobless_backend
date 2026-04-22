import type { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubRedis, subRedis } from '../../lib/redis.js';
import { verifyAccessToken } from '../../lib/jwt.js';
import { setSocketEmitter } from '../consultations/consultations.service.js';
import { db } from '../../db/client.js';
import * as consultRepo from '../consultations/consultations.repository.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
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

    socket.on('disconnect', () => {
      logger.debug({ sub, actorType }, 'Socket disconnected');
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
