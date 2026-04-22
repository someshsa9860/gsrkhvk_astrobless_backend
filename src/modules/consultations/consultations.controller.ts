import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './consultations.service.js';
import type { RequestConsultationSchema, EndConsultationSchema, SubmitReviewSchema, ConsultationQuerySchema } from './consultations.schema.js';
import type { z } from 'zod';
import { JWT_AUDIENCE } from '../../config/constants.js';

export async function requestConsultation(req: FastifyRequest<{ Body: z.infer<typeof RequestConsultationSchema> }>, reply: FastifyReply) {
  const result = await service.requestConsultation(req.requestContext.actorId!, req.body);
  return reply.status(201).send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function acceptConsultation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const result = await service.acceptConsultation(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function startConsultation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const result = await service.startConsultation(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function endConsultation(req: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof EndConsultationSchema> }>, reply: FastifyReply) {
  const result = await service.endConsultation(req.requestContext.actorId!, req.params.id, req.body.reason);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function submitReview(req: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof SubmitReviewSchema> }>, reply: FastifyReply) {
  await service.submitReview(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data: { message: 'Review submitted.' }, traceId: req.requestContext.traceId });
}

export async function getMyConsultations(req: FastifyRequest<{ Querystring: z.infer<typeof ConsultationQuerySchema> }>, reply: FastifyReply) {
  const audience = req.requestContext.audience;
  const id = req.requestContext.actorId!;
  const result = audience === JWT_AUDIENCE.ASTROLOGER
    ? await service.getAstrologerConsultations(id, req.query.page, req.query.limit)
    : await service.getCustomerConsultations(id, req.query.page, req.query.limit);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}
