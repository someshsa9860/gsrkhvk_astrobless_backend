// Thin HTTP handlers for admin consultation routes.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminConsultations.service.js';
import type { ConsultationListQuery, ForceEndInput } from './adminConsultations.schema.js';

export async function listConsultations(
  req: FastifyRequest<{ Querystring: ConsultationListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listConsultations(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getConsultation(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = await service.getConsultation(req.params.id);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function listMessages(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply,
) {
  const { page = 1, limit = 50 } = req.query;
  const data = await service.listMessages(req.requestContext.actorId!, req.params.id, page, limit);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function forceEnd(
  req: FastifyRequest<{ Params: { id: string }; Body: ForceEndInput }>,
  reply: FastifyReply,
) {
  await service.forceEnd(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data: { message: 'Consultation ended.' }, traceId: req.requestContext.traceId });
}
