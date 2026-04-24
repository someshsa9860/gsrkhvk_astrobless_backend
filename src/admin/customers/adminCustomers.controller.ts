// Thin HTTP handlers for admin customer routes — delegate all logic to the service.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminCustomers.service.js';
import type {
  CustomerListQuery,
  BlockCustomerInput,
  WalletAdjustInput,
  CreateCustomerInput,
  UpdateCustomerInput,
} from './adminCustomers.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

export async function listCustomers(
  req: FastifyRequest<{ Querystring: CustomerListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listCustomers(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getCustomer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = await service.getCustomer(req.params.id);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

// ── Block / Unblock ───────────────────────────────────────────────────────────

export async function blockCustomer(
  req: FastifyRequest<{ Params: { id: string }; Body: BlockCustomerInput }>,
  reply: FastifyReply,
) {
  await service.blockCustomer(req.requestContext.actorId!, req.params.id, req.body.reason);
  return reply.send({ ok: true, data: { message: 'Customer blocked.' }, traceId: req.requestContext.traceId });
}

export async function unblockCustomer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await service.unblockCustomer(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { message: 'Customer unblocked.' }, traceId: req.requestContext.traceId });
}

// ── Wallet credit ─────────────────────────────────────────────────────────────

export async function walletCredit(
  req: FastifyRequest<{ Params: { id: string }; Body: WalletAdjustInput }>,
  reply: FastifyReply,
) {
  const data = await service.walletCredit(req.requestContext.actorId!, req.params.id, req.body);
  return reply.status(201).send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function createCustomer(req: FastifyRequest<{ Body: CreateCustomerInput }>, reply: FastifyReply) {
  const data = await service.createCustomer(req.requestContext.actorId!, req.body);
  return reply.status(201).send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function updateCustomer(
  req: FastifyRequest<{ Params: { id: string }; Body: UpdateCustomerInput }>,
  reply: FastifyReply,
) {
  const data = await service.updateCustomer(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function deleteCustomer(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await service.deleteCustomer(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { message: 'Customer data anonymized.' }, traceId: req.requestContext.traceId });
}
