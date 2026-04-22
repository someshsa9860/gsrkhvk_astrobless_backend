import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './astrologers.service.js';
import type { UpdateAstrologerProfileSchema, SearchAstrologersQuerySchema, SetOnlineStatusSchema } from './astrologers.schema.js';
import type { z } from 'zod';

export async function getMyProfile(req: FastifyRequest, reply: FastifyReply) {
  const profile = await service.getProfile(req.requestContext.actorId!);
  return reply.send({ ok: true, data: profile, traceId: req.requestContext.traceId });
}

export async function updateMyProfile(req: FastifyRequest<{ Body: z.infer<typeof UpdateAstrologerProfileSchema> }>, reply: FastifyReply) {
  const profile = await service.updateProfile(req.requestContext.actorId!, req.body);
  return reply.send({ ok: true, data: profile, traceId: req.requestContext.traceId });
}

export async function setOnlineStatus(req: FastifyRequest<{ Body: z.infer<typeof SetOnlineStatusSchema> }>, reply: FastifyReply) {
  await service.setOnlineStatus(req.requestContext.actorId!, req.body.isOnline);
  return reply.send({ ok: true, data: { message: `Status updated.` }, traceId: req.requestContext.traceId });
}

export async function searchAstrologers(req: FastifyRequest<{ Querystring: z.infer<typeof SearchAstrologersQuerySchema> }>, reply: FastifyReply) {
  const result = await service.searchAstrologers(req.query);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function getPublicProfile(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const profile = await service.getPublicProfile(req.params.id);
  return reply.send({ ok: true, data: profile, traceId: req.requestContext.traceId });
}
