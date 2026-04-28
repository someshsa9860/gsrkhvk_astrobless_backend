import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './adminAstroMall.service.js';
import type {
  ProductListQuery, CreateProductInput, UpdateProductInput, RestockInput,
  OrderListQuery, UpdateOrderStatusInput, OrderRefundInput,
} from './adminAstroMall.schema.js';

// ── Products ──────────────────────────────────────────────────────────────────

export async function listProducts(req: FastifyRequest<{ Querystring: ProductListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listProducts(req.query), traceId: req.requestContext.traceId });
}

export async function getProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getProduct(req.params.id), traceId: req.requestContext.traceId });
}

export async function createProduct(req: FastifyRequest<{ Body: CreateProductInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createProduct(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}

export async function updateProduct(req: FastifyRequest<{ Params: { id: string }; Body: UpdateProductInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateProduct(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}

export async function deleteProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await svc.deleteProduct(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}

export async function restockProduct(req: FastifyRequest<{ Params: { id: string }; Body: RestockInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.restockProduct(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function listOrders(req: FastifyRequest<{ Querystring: OrderListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listOrders(req.query), traceId: req.requestContext.traceId });
}

export async function getOrder(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getOrder(req.params.id), traceId: req.requestContext.traceId });
}

export async function updateOrderStatus(req: FastifyRequest<{ Params: { id: string }; Body: UpdateOrderStatusInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateOrderStatus(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}

export async function refundOrder(req: FastifyRequest<{ Params: { id: string }; Body: OrderRefundInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.refundOrder(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
