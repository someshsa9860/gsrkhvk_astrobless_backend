import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminArticles.service.js';
import type { ArticleListQuery, CreateArticleInput, UpdateArticleInput } from './adminArticles.schema.js';

export async function listArticles(req: FastifyRequest<{ Querystring: ArticleListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await service.listArticles(req.query), traceId: req.requestContext.traceId });
}
export async function getArticle(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await service.getArticle(req.params.id), traceId: req.requestContext.traceId });
}
export async function createArticle(req: FastifyRequest<{ Body: CreateArticleInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await service.createArticle(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateArticle(req: FastifyRequest<{ Params: { id: string }; Body: UpdateArticleInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await service.updateArticle(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteArticle(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await service.deleteArticle(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}
export async function publishArticle(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await service.publishArticle(req.requestContext.actorId!, req.params.id, true);
  return reply.send({ ok: true, data: { published: true }, traceId: req.requestContext.traceId });
}
export async function unpublishArticle(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await service.publishArticle(req.requestContext.actorId!, req.params.id, false);
  return reply.send({ ok: true, data: { published: false }, traceId: req.requestContext.traceId });
}
