import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './wallet.service.js';
import type { TopupSchema, WalletTransactionQuerySchema } from './wallet.schema.js';
import type { z } from 'zod';

export async function getWallet(req: FastifyRequest, reply: FastifyReply) {
  const wallet = await service.getWallet(req.requestContext.actorId!);
  return reply.send({ ok: true, data: wallet, traceId: req.requestContext.traceId });
}

export async function getProviders(req: FastifyRequest, reply: FastifyReply) {
  const providers = await service.listTopupProviders();
  return reply.send({ ok: true, data: { providers }, traceId: req.requestContext.traceId });
}

export async function initiateTopup(req: FastifyRequest<{ Body: z.infer<typeof TopupSchema> }>, reply: FastifyReply) {
  const result = await service.initiateTopup(
    req.requestContext.actorId!,
    req.body.amountPaise,
    req.body.providerKey,
    req.body.idempotencyKey,
  );
  return reply.status(201).send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function getTransactions(req: FastifyRequest<{ Querystring: z.infer<typeof WalletTransactionQuerySchema> }>, reply: FastifyReply) {
  const result = await service.getTransactions(req.requestContext.actorId!, req.query.page, req.query.limit);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}
