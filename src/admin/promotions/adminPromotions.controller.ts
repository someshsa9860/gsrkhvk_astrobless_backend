import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './adminPromotions.service.js';
import type {
  CreateRechargePackInput, UpdateRechargePackInput,
  CouponListQuery, CreateCouponInput, UpdateCouponInput,
} from './adminPromotions.schema.js';

// ── Recharge Packs ────────────────────────────────────────────────────────────
export async function listRechargePacks(req: FastifyRequest, reply: FastifyReply) {
  const items = await svc.listRechargePacks();
  return reply.send({ ok: true, data: { items, total: items.length }, traceId: req.requestContext.traceId });
}
export async function createRechargePack(req: FastifyRequest<{ Body: CreateRechargePackInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createRechargePack(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateRechargePack(req: FastifyRequest<{ Params: { id: string }; Body: UpdateRechargePackInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateRechargePack(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteRechargePack(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await svc.deleteRechargePack(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}

// ── Coupons ───────────────────────────────────────────────────────────────────
export async function listCoupons(req: FastifyRequest<{ Querystring: CouponListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listCoupons(req.query), traceId: req.requestContext.traceId });
}
export async function getCoupon(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getCoupon(req.params.id), traceId: req.requestContext.traceId });
}
export async function createCoupon(req: FastifyRequest<{ Body: CreateCouponInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createCoupon(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateCoupon(req: FastifyRequest<{ Params: { id: string }; Body: UpdateCouponInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateCoupon(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteCoupon(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await svc.deleteCoupon(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}
