// Thin HTTP handlers for admin settings routes.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminSettings.service.js';
import type { UpsertSettingInput } from './adminSettings.schema.js';

export async function listSettings(
  req: FastifyRequest<{ Querystring: { category?: string } }>,
  reply: FastifyReply,
) {
  // Pass superAdmin flag so sensitive values are visible to the right role.
  const adminRole = (req.requestContext as unknown as Record<string, unknown>)['role'] as string | undefined;
  const data = await service.listSettings(req.query.category, adminRole === 'superAdmin');
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getSetting(
  req: FastifyRequest<{ Params: { key: string } }>,
  reply: FastifyReply,
) {
  const data = await service.getSetting(req.params.key);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function upsertSetting(
  req: FastifyRequest<{ Params: { key: string }; Body: UpsertSettingInput }>,
  reply: FastifyReply,
) {
  const data = await service.upsertSetting(req.requestContext.actorId!, req.params.key, req.body);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}
