import { z } from 'zod';

export const RegisterFcmTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
});

export const ListNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export const MarkReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()).min(1).max(100),
});
