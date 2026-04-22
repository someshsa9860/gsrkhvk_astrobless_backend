import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './customers.service.js';
import type { UpdateProfileSchema } from './customers.schema.js';
import type { z } from 'zod';

export async function getProfile(req: FastifyRequest, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  const profile = await service.getProfile(customerId);
  return reply.send({ ok: true, data: profile, traceId: req.requestContext.traceId });
}

export async function updateProfile(req: FastifyRequest<{ Body: z.infer<typeof UpdateProfileSchema> }>, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  const profile = await service.updateProfile(customerId, req.body);
  return reply.send({ ok: true, data: profile, traceId: req.requestContext.traceId });
}
