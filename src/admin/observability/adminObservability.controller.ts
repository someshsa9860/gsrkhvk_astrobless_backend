// Thin HTTP handlers for admin observability routes.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminObservability.service.js';
import type { ErrorListQuery, AuditQuery, ResolveErrorInput } from './adminObservability.schema.js';

export async function listErrors(
  req: FastifyRequest<{ Querystring: ErrorListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listErrors(req.requestContext.actorId!, req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getErrorStats(req: FastifyRequest, reply: FastifyReply) {
  const data = await service.getErrorStats();
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getError(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = await service.getError(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function resolveError(
  req: FastifyRequest<{ Params: { id: string }; Body: ResolveErrorInput }>,
  reply: FastifyReply,
) {
  await service.resolveError(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data: { message: 'Error resolved.' }, traceId: req.requestContext.traceId });
}

export async function reopenError(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await service.reopenError(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { message: 'Error reopened.' }, traceId: req.requestContext.traceId });
}

export async function listAuditLog(
  req: FastifyRequest<{ Querystring: AuditQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listAuditLog(req.requestContext.actorId!, req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}
