import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './addresses.service.js';
import type { CreateAddressSchema, UpdateAddressSchema } from './addresses.schema.js';
import type { z } from 'zod';

export async function listAddresses(req: FastifyRequest, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  const addresses = await service.listAddresses(customerId);
  return reply.send({ ok: true, data: addresses, traceId: req.requestContext.traceId });
}

export async function getAddress(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  const address = await service.getAddress(customerId, req.params.id);
  return reply.send({ ok: true, data: address, traceId: req.requestContext.traceId });
}

export async function createAddress(
  req: FastifyRequest<{ Body: z.infer<typeof CreateAddressSchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  const address = await service.createAddress(customerId, req.body);
  return reply.code(201).send({ ok: true, data: address, traceId: req.requestContext.traceId });
}

export async function updateAddress(
  req: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateAddressSchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  const address = await service.updateAddress(customerId, req.params.id, req.body);
  return reply.send({ ok: true, data: address, traceId: req.requestContext.traceId });
}

export async function deleteAddress(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  await service.deleteAddress(customerId, req.params.id);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}

export async function setDefaultAddress(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const customerId = req.requestContext.actorId!;
  await service.setDefaultAddress(customerId, req.params.id);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}
