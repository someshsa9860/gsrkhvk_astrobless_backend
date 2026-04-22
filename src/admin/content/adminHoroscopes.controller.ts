import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminHoroscopes.service.js';
import type {
  HoroscopeListQuery,
  CreateHoroscopeInput,
  UpdateHoroscopeInput,
  BulkGenerateInput,
  SetPublishedInput,
} from './adminHoroscopes.schema.js';

export async function listHoroscopes(
  req: FastifyRequest<{ Querystring: HoroscopeListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listHoroscopes(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getHoroscope(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = await service.getHoroscope(req.params.id);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function createHoroscope(
  req: FastifyRequest<{ Body: CreateHoroscopeInput }>,
  reply: FastifyReply,
) {
  const data = await service.createHoroscope(req.requestContext.actorId!, req.body);
  return reply.status(201).send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function updateHoroscope(
  req: FastifyRequest<{ Params: { id: string }; Body: UpdateHoroscopeInput }>,
  reply: FastifyReply,
) {
  const data = await service.updateHoroscope(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function deleteHoroscope(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await service.deleteHoroscope(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}

export async function publishHoroscope(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await service.setPublished(req.requestContext.actorId!, req.params.id, { isPublished: true });
  return reply.send({ ok: true, data: { published: true }, traceId: req.requestContext.traceId });
}

export async function unpublishHoroscope(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await service.setPublished(req.requestContext.actorId!, req.params.id, { isPublished: false });
  return reply.send({ ok: true, data: { published: false }, traceId: req.requestContext.traceId });
}

export async function bulkGenerate(
  req: FastifyRequest<{ Body: BulkGenerateInput }>,
  reply: FastifyReply,
) {
  const data = await service.bulkGenerate(req.requestContext.actorId!, req.body);
  return reply.status(202).send({ ok: true, data, traceId: req.requestContext.traceId });
}
