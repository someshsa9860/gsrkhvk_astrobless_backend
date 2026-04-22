// Thin HTTP handlers for admin astrologer routes — delegate all logic to the service.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminAstrologers.service.js';
import type {
  AstrologerListQuery,
  KycDecisionInput,
  BlockAstrologerInput,
  CommissionOverrideInput,
} from './adminAstrologers.schema.js';

export async function listAstrologers(
  req: FastifyRequest<{ Querystring: AstrologerListQuery }>,
  reply: FastifyReply,
) {
  const data = await service.listAstrologers(req.query);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getAstrologer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = await service.getAstrologer(req.params.id);
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function decideKyc(
  req: FastifyRequest<{ Params: { id: string }; Body: KycDecisionInput }>,
  reply: FastifyReply,
) {
  await service.decideKyc(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({
    ok: true,
    data: { message: `KYC ${req.body.decision}.` },
    traceId: req.requestContext.traceId,
  });
}

export async function blockAstrologer(
  req: FastifyRequest<{ Params: { id: string }; Body: BlockAstrologerInput }>,
  reply: FastifyReply,
) {
  await service.blockAstrologer(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data: { message: 'Astrologer blocked.' }, traceId: req.requestContext.traceId });
}

export async function unblockAstrologer(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await service.unblockAstrologer(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { message: 'Astrologer unblocked.' }, traceId: req.requestContext.traceId });
}

export async function overrideCommission(
  req: FastifyRequest<{ Params: { id: string }; Body: CommissionOverrideInput }>,
  reply: FastifyReply,
) {
  await service.overrideCommission(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({
    ok: true,
    data: { message: `Commission updated to ${req.body.commissionPct}%.` },
    traceId: req.requestContext.traceId,
  });
}
