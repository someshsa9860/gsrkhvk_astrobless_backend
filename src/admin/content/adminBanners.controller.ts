import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminBanners.service.js';
import type { BannerListQuery, CreateBannerInput, UpdateBannerInput } from './adminBanners.schema.js';

export async function listBanners(req: FastifyRequest<{ Querystring: BannerListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await service.listBanners(req.query), traceId: req.requestContext.traceId });
}
export async function getBanner(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await service.getBanner(req.params.id), traceId: req.requestContext.traceId });
}
export async function createBanner(req: FastifyRequest<{ Body: CreateBannerInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await service.createBanner(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateBanner(req: FastifyRequest<{ Params: { id: string }; Body: UpdateBannerInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await service.updateBanner(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteBanner(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await service.deleteBanner(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}
