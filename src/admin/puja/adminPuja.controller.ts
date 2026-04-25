import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './adminPuja.service.js';
import type {
  TemplateListQuery, CreateTemplateInput, UpdateTemplateInput, CreateTierInput,
  SlotListQuery, CreateSlotInput, UpdateSlotInput,
  BookingListQuery, UpdateBookingInput, BookingRefundInput,
} from './adminPuja.schema.js';

// ── Templates ─────────────────────────────────────────────────────────────────
export async function listTemplates(req: FastifyRequest<{ Querystring: TemplateListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listTemplates(req.query), traceId: req.requestContext.traceId });
}
export async function getTemplate(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getTemplate(req.params.id), traceId: req.requestContext.traceId });
}
export async function createTemplate(req: FastifyRequest<{ Body: CreateTemplateInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createTemplate(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateTemplate(req: FastifyRequest<{ Params: { id: string }; Body: UpdateTemplateInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateTemplate(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteTemplate(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await svc.deleteTemplate(req.requestContext.actorId!, req.params.id);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}
export async function createTier(req: FastifyRequest<{ Params: { id: string }; Body: CreateTierInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createTier(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function deleteTier(req: FastifyRequest<{ Params: { id: string; tierId: string } }>, reply: FastifyReply) {
  await svc.deleteTier(req.requestContext.actorId!, req.params.id, req.params.tierId);
  return reply.send({ ok: true, data: { deleted: true }, traceId: req.requestContext.traceId });
}

// ── Slots ─────────────────────────────────────────────────────────────────────
export async function listSlots(req: FastifyRequest<{ Querystring: SlotListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listSlots(req.query), traceId: req.requestContext.traceId });
}
export async function getSlot(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getSlot(req.params.id), traceId: req.requestContext.traceId });
}
export async function createSlot(req: FastifyRequest<{ Body: CreateSlotInput }>, reply: FastifyReply) {
  return reply.status(201).send({ ok: true, data: await svc.createSlot(req.requestContext.actorId!, req.body), traceId: req.requestContext.traceId });
}
export async function updateSlot(req: FastifyRequest<{ Params: { id: string }; Body: UpdateSlotInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateSlot(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function cancelSlot(req: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>, reply: FastifyReply) {
  await svc.cancelSlot(req.requestContext.actorId!, req.params.id, (req.body as { reason?: string }).reason);
  return reply.send({ ok: true, data: { cancelled: true }, traceId: req.requestContext.traceId });
}

// ── Bookings ──────────────────────────────────────────────────────────────────
export async function listBookings(req: FastifyRequest<{ Querystring: BookingListQuery }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.listBookings(req.query), traceId: req.requestContext.traceId });
}
export async function getBooking(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.getBooking(req.params.id), traceId: req.requestContext.traceId });
}
export async function updateBooking(req: FastifyRequest<{ Params: { id: string }; Body: UpdateBookingInput }>, reply: FastifyReply) {
  return reply.send({ ok: true, data: await svc.updateBooking(req.requestContext.actorId!, req.params.id, req.body), traceId: req.requestContext.traceId });
}
export async function refundBooking(req: FastifyRequest<{ Params: { id: string }; Body: BookingRefundInput }>, reply: FastifyReply) {
  await svc.refundBooking(req.requestContext.actorId!, req.params.id, req.body);
  return reply.send({ ok: true, data: { refunded: true }, traceId: req.requestContext.traceId });
}
