import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './adminSkills.service.js';
import type { SkillListQuery, CreateSkillInput, UpdateSkillInput } from './adminSkills.schema.js';

export async function listSkills(req: FastifyRequest<{ Querystring: SkillListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listSkills(req.query), traceId: req.requestContext.traceId });
}
export async function getSkill(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getSkill(req.params.id), traceId: req.requestContext.traceId });
}
export async function createSkill(req: FastifyRequest<{ Body: CreateSkillInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createSkill(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateSkill(req: FastifyRequest<{ Params: { id: string }; Body: UpdateSkillInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateSkill(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteSkill(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await svc.deleteSkill(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}
