import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './adminLanguages.service.js';
import type { LanguageListQuery, CreateLanguageInput, UpdateLanguageInput } from './adminLanguages.schema.js';

export async function listLanguages(req: FastifyRequest<{ Querystring: LanguageListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listLanguages(req.query), traceId: req.requestContext.traceId });
}
export async function getLanguage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getLanguage(req.params.id), traceId: req.requestContext.traceId });
}
export async function createLanguage(req: FastifyRequest<{ Body: CreateLanguageInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createLanguage(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateLanguage(req: FastifyRequest<{ Params: { id: string }; Body: UpdateLanguageInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateLanguage(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteLanguage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await svc.deleteLanguage(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}
