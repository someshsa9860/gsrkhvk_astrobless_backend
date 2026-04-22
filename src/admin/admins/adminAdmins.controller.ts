// Thin HTTP handlers for admin management routes.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminAdmins.service.js';
import type { AdminListQuery, CreateAdminInput, UpdateAdminInput } from './adminAdmins.schema.js';

export async function listAdmins(
  req: FastifyRequest<{ Querystring: AdminListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listAdmins(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function createAdmin(
  req: FastifyRequest<{ Body: CreateAdminInput }>,
  reply: FastifyReply,
) {
  const data = await service.createAdmin(req.body, req.requestContext.actorId!);
  return reply.status(201).send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getAdmin(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = await service.getAdmin(req.params.id);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getMe(req: FastifyRequest, reply: FastifyReply) {
  // Re-uses getAdmin with the authenticated admin's own ID.
  const data = await service.getAdmin(req.requestContext.actorId!);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function updateAdmin(
  req: FastifyRequest<{ Params: { id: string }; Body: UpdateAdminInput }>,
  reply: FastifyReply,
) {
  const data = await service.updateAdmin(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function deactivateAdmin(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await service.deactivateAdmin(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { message: 'Admin deactivated.' }, traceId: req.requestContext.traceId });
}
