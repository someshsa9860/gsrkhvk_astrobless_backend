import { prisma } from '../../db/client.js';
import { upsertFcmToken, subscribeToTopic, unsubscribeFromTopic } from '../notifications/notifications.service.js';
import type { z } from 'zod';
import type { ListNotificationsQuerySchema, MarkReadSchema } from './notifications.schema.js';

export async function listNotifications(astrologerId: string, q: z.infer<typeof ListNotificationsQuerySchema>) {
  const limit = q.limit ?? 20;
  const page = q.page ?? 1;
  const skip = (page - 1) * limit;

  const where = {
    recipientType: 'astrologer',
    recipientId: astrologerId,
    ...(q.unreadOnly ? { readAt: null } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function markNotificationsRead(astrologerId: string, input: z.infer<typeof MarkReadSchema>) {
  await prisma.notification.updateMany({
    where: {
      id: { in: input.notificationIds },
      recipientType: 'astrologer',
      recipientId: astrologerId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(astrologerId: string) {
  await prisma.notification.updateMany({
    where: { recipientType: 'astrologer', recipientId: astrologerId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getUnreadCount(astrologerId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientType: 'astrologer', recipientId: astrologerId, readAt: null },
  });
}

export async function registerFcmToken(astrologerId: string, token: string, platform: 'ios' | 'android' | 'web') {
  await upsertFcmToken('astrologer', astrologerId, token, platform);
  // Subscribe device to astrologer's personal topic so sendPush() works
  // without a DB lookup. Topic = astrologerId.
  void subscribeToTopic(token, astrologerId);
}

export async function deleteFcmToken(astrologerId: string, token: string) {
  void unsubscribeFromTopic(token, astrologerId);
  await prisma.fcmToken.deleteMany({
    where: { token, ownerType: 'astrologer', ownerId: astrologerId },
  });
}
