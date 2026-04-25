import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './notifications.service.js';
import type { ListNotificationsQuerySchema, MarkReadSchema, RegisterFcmTokenSchema } from './notifications.schema.js';
import type { z } from 'zod';

export async function listNotifications(
  req: FastifyRequest<{ Querystring: z.infer<typeof ListNotificationsQuerySchema> }>,
  reply: FastifyReply,
) {
  const astrologerId = req.requestContext.actorId!;
  const result = await service.listNotifications(astrologerId, req.query);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function markRead(
  req: FastifyRequest<{ Body: z.infer<typeof MarkReadSchema> }>,
  reply: FastifyReply,
) {
  const astrologerId = req.requestContext.actorId!;
  await service.markNotificationsRead(astrologerId, req.body);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}

export async function markAllRead(req: FastifyRequest, reply: FastifyReply) {
  const astrologerId = req.requestContext.actorId!;
  await service.markAllNotificationsRead(astrologerId);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}

export async function getUnreadCount(req: FastifyRequest, reply: FastifyReply) {
  const astrologerId = req.requestContext.actorId!;
  const count = await service.getUnreadCount(astrologerId);
  return reply.send({ ok: true, data: { count }, traceId: req.requestContext.traceId });
}

export async function registerFcmToken(
  req: FastifyRequest<{ Body: z.infer<typeof RegisterFcmTokenSchema> }>,
  reply: FastifyReply,
) {
  const astrologerId = req.requestContext.actorId!;
  await service.registerFcmToken(astrologerId, req.body.token, req.body.platform);
  return reply.code(201).send({ ok: true, traceId: req.requestContext.traceId });
}

export async function deleteFcmToken(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
) {
  const astrologerId = req.requestContext.actorId!;
  await service.deleteFcmToken(astrologerId, req.params.token);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}
