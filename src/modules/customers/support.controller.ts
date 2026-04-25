import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './support.service.js';
import type { CreateSupportTicketSchema, ListTicketsQuerySchema, AddTicketMessageSchema } from './support.schema.js';
import type { z } from 'zod';

export async function createTicket(
  req: FastifyRequest<{ Body: z.infer<typeof CreateSupportTicketSchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  const ticket = await service.createTicket(customerId, req.body);
  return reply.code(201).send({ ok: true, data: ticket, traceId: req.requestContext.traceId });
}

export async function listTickets(
  req: FastifyRequest<{ Querystring: z.infer<typeof ListTicketsQuerySchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  const result = await service.listTickets(customerId, req.query);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function getTicket(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  const ticket = await service.getTicket(customerId, req.params.id);
  return reply.send({ ok: true, data: ticket, traceId: req.requestContext.traceId });
}

export async function addMessage(
  req: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof AddTicketMessageSchema> }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  const message = await service.addMessage(customerId, req.params.id, req.body);
  return reply.code(201).send({ ok: true, data: message, traceId: req.requestContext.traceId });
}

export async function closeTicket(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const customerId = req.requestContext.actorId!;
  await service.closeTicket(customerId, req.params.id);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}
