import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminRoles.service.js';
import type { RoleListQuery, CreateRoleInput, UpdateRoleInput } from './adminRoles.schema.js';

export async function listRoles(req: FastifyRequest<{ Querystring: RoleListQuery }>, reply: FastifyReply) {
  const data = await service.listRoles(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getRole(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const data = await service.getRole(req.params.id);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function createRole(req: FastifyRequest<{ Body: CreateRoleInput }>, reply: FastifyReply) {
  const data = await service.createRole(req.requestContext.actorId!, req.body);
  return reply.status(201).send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function updateRole(
  req: FastifyRequest<{ Params: { id: string }; Body: UpdateRoleInput }>,
  reply: FastifyReply,
) {
  const data = await service.updateRole(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function deleteRole(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await service.deleteRole(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { message: 'Role deleted.' }, traceId: req.requestContext.traceId });
}
