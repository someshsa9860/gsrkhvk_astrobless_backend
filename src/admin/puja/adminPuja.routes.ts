import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import * as ctrl from './adminPuja.controller.js';
import {
  TemplateListQuerySchema, CreateTemplateSchema, UpdateTemplateSchema, CreateTierSchema,
  SlotListQuerySchema, CreateSlotSchema, UpdateSlotSchema,
  BookingListQuerySchema, UpdateBookingSchema, BookingRefundSchema,
} from './adminPuja.schema.js';

export const adminPujaRoutes: FastifyPluginAsync = async (app) => {
  const aud     = app.requireAudience(JWT_AUDIENCE.ADMIN);
  const manage  = [aud, requirePermission(AdminPermission.PUJA_MANAGE)];
  const bookView = [aud, requirePermission(AdminPermission.PUJA_BOOKING_VIEW)];
  const bookMgmt = [aud, requirePermission(AdminPermission.PUJA_BOOKING_MANAGE)];

  // ── Templates ───────────────────────────────────────────────────────────────
  app.get('/v1/admin/puja/templates',           { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'List puja templates', querystring: zodToJsonSchema(TemplateListQuerySchema) }, handler: ctrl.listTemplates });
  app.get('/v1/admin/puja/templates/:id',       { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Get puja template' }, handler: ctrl.getTemplate });
  app.post('/v1/admin/puja/templates',          { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Create puja template', body: zodToJsonSchema(CreateTemplateSchema) }, handler: ctrl.createTemplate });
  app.patch('/v1/admin/puja/templates/:id',     { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Update puja template', body: zodToJsonSchema(UpdateTemplateSchema) }, handler: ctrl.updateTemplate });
  app.delete('/v1/admin/puja/templates/:id',    { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Deactivate puja template' }, handler: ctrl.deleteTemplate });
  app.post('/v1/admin/puja/templates/:id/tiers', { preHandler: manage,  schema: { tags: ['admin:puja'], summary: 'Add tier to template', body: zodToJsonSchema(CreateTierSchema) }, handler: ctrl.createTier });
  app.delete('/v1/admin/puja/templates/:id/tiers/:tierId', { preHandler: manage, schema: { tags: ['admin:puja'], summary: 'Delete tier' }, handler: ctrl.deleteTier });

  // ── Slots ───────────────────────────────────────────────────────────────────
  app.get('/v1/admin/puja/slots',               { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'List puja slots', querystring: zodToJsonSchema(SlotListQuerySchema) }, handler: ctrl.listSlots });
  app.get('/v1/admin/puja/slots/:id',           { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Get puja slot' }, handler: ctrl.getSlot });
  app.post('/v1/admin/puja/slots',              { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Create puja slot', body: zodToJsonSchema(CreateSlotSchema) }, handler: ctrl.createSlot });
  app.patch('/v1/admin/puja/slots/:id',         { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Update puja slot', body: zodToJsonSchema(UpdateSlotSchema) }, handler: ctrl.updateSlot });
  app.post('/v1/admin/puja/slots/:id/cancel',   { preHandler: manage,   schema: { tags: ['admin:puja'], summary: 'Cancel puja slot' }, handler: ctrl.cancelSlot });

  // ── Bookings ────────────────────────────────────────────────────────────────
  app.get('/v1/admin/puja/bookings',            { preHandler: bookView, schema: { tags: ['admin:puja'], summary: 'List puja bookings', querystring: zodToJsonSchema(BookingListQuerySchema) }, handler: ctrl.listBookings });
  app.get('/v1/admin/puja/bookings/:id',        { preHandler: bookView, schema: { tags: ['admin:puja'], summary: 'Get puja booking' }, handler: ctrl.getBooking });
  app.patch('/v1/admin/puja/bookings/:id',      { preHandler: bookMgmt, schema: { tags: ['admin:puja'], summary: 'Update puja booking', body: zodToJsonSchema(UpdateBookingSchema) }, handler: ctrl.updateBooking });
  app.post('/v1/admin/puja/bookings/:id/refund', { preHandler: bookMgmt, schema: { tags: ['admin:puja'], summary: 'Refund puja booking', body: zodToJsonSchema(BookingRefundSchema) }, handler: ctrl.refundBooking });
};
