import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './adminSupport.service.js';
import type { TicketListQuery, UpdateTicketInput, AssignTicketInput, PostMessageInput, ResolveTicketInput } from './adminSupport.schema.js';

export async function listTickets(req: FastifyRequest<{ Querystring: TicketListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listTickets(req.query), traceId: req.requestContext.traceId });
}
export async function getTicket(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getTicket(req.params.id), traceId: req.requestContext.traceId });
}
export async function updateTicket(req: FastifyRequest<{ Params: { id: string }; Body: UpdateTicketInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateTicket(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function assignTicket(req: FastifyRequest<{ Params: { id: string }; Body: AssignTicketInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.assignTicket(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function postMessage(req: FastifyRequest<{ Params: { id: string }; Body: PostMessageInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.postMessage(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function resolveTicket(req: FastifyRequest<{ Params: { id: string }; Body: ResolveTicketInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.resolveTicket(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
