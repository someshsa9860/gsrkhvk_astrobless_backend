import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './notifications.service.js';
import type { ListNotificationsQuerySchema, MarkReadSchema, RegisterFcmTokenSchema } from './notifications.schema.js';
import type { z } from 'zod';

export async function listNotifications(
  req: FastifyRequest<{ Querystring: z.infer<typeof ListNotificationsQuerySchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  const result = await service.listNotifications(customerId, req.query);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function markRead(
  req: FastifyRequest<{ Body: z.infer<typeof MarkReadSchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  await service.markNotificationsRead(customerId, req.body);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}

export async function markAllRead(req: FastifyRequest, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  await service.markAllNotificationsRead(customerId);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}

export async function getUnreadCount(req: FastifyRequest, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  const count = await service.getUnreadCount(customerId);
  return reply.send({ ok: true, data: { count }, traceId: req.requestContext.traceId });
}

export async function registerFcmToken(
  req: FastifyRequest<{ Body: z.infer<typeof RegisterFcmTokenSchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  await service.registerFcmToken(customerId, req.body.token, req.body.platform);
  return reply.code(201).send({ ok: true, traceId: req.requestContext.traceId });
}

export async function deleteFcmToken(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  await service.deleteFcmToken(customerId, req.params.token);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}
