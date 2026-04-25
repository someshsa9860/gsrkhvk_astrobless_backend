import { prisma } from '../../db/client.js';
import { upsertFcmToken } from '../notifications/notifications.service.js';
import type { z } from 'zod';
import type { ListNotificationsQuerySchema, MarkReadSchema } from './notifications.schema.js';

export async function listNotifications(customerId: string, q: z.infer<typeof ListNotificationsQuerySchema>) {
  const limit = q.limit ?? 20;
  const page = q.page ?? 1;
  const skip = (page - 1) * limit;

  const where = {
    recipientType: 'customer',
    recipientId: customerId,
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

export async function markNotificationsRead(customerId: string, input: z.infer<typeof MarkReadSchema>) {
  const now = new Date();
  await prisma.notification.updateMany({
    where: {
      id: { in: input.notificationIds },
      recipientType: 'customer',
      recipientId: customerId,
      readAt: null,
    },
    data: { readAt: now },
  });
}

export async function markAllNotificationsRead(customerId: string) {
  await prisma.notification.updateMany({
    where: { recipientType: 'customer', recipientId: customerId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function registerFcmToken(customerId: string, token: string, platform: 'ios' | 'android' | 'web') {
  await upsertFcmToken('customer', customerId, token, platform);
}

export async function deleteFcmToken(customerId: string, token: string) {
  await prisma.fcmToken.deleteMany({
    where: { token, ownerType: 'customer', ownerId: customerId },
  });
}

export async function getUnreadCount(customerId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientType: 'customer', recipientId: customerId, readAt: null },
  });
}
