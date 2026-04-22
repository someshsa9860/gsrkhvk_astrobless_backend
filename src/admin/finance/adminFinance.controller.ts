// Thin HTTP handlers for admin finance routes.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminFinance.service.js';
import type { TransactionListQuery, PayoutListQuery, ApprovePayoutInput } from './adminFinance.schema.js';

export async function listTransactions(
  req: FastifyRequest<{ Querystring: TransactionListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listTransactions(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function listPayouts(
  req: FastifyRequest<{ Querystring: PayoutListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listPayouts(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function approvePayout(
  req: FastifyRequest<{ Params: { id: string }; Body: ApprovePayoutInput }>,
  reply: FastifyReply,
) {
  const data = await service.approvePayout(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}
