import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import * as ctrl from './adminSupport.controller.js';
import { TicketListQuerySchema, UpdateTicketSchema, AssignTicketSchema, PostMessageSchema, ResolveTicketSchema } from './adminSupport.schema.js';

export const adminSupportRoutes: FastifyPluginAsync = async (app) => {
  const aud  = app.requireAudience(JWT_AUDIENCE.ADMIN);
  const view = [aud, requirePermission(AdminPermission.SUPPORT_TICKET_VIEW)];
  const resp = [aud, requirePermission(AdminPermission.SUPPORT_TICKET_RESPOND)];

  app.get('/v1/admin/support/tickets',                 { preHandler: view, schema: { tags: ['admin:support'], summary: 'List support tickets', querystring: zodToJsonSchema(TicketListQuerySchema) }, handler: ctrl.listTickets });
  app.get('/v1/admin/support/tickets/:id',             { preHandler: view, schema: { tags: ['admin:support'], summary: 'Get ticket detail' }, handler: ctrl.getTicket });
  app.patch('/v1/admin/support/tickets/:id',           { preHandler: resp, schema: { tags: ['admin:support'], summary: 'Update ticket status/priority', body: zodToJsonSchema(UpdateTicketSchema) }, handler: ctrl.updateTicket });
  app.post('/v1/admin/support/tickets/:id/assign',     { preHandler: resp, schema: { tags: ['admin:support'], summary: 'Assign ticket to admin', body: zodToJsonSchema(AssignTicketSchema) }, handler: ctrl.assignTicket });
  app.post('/v1/admin/support/tickets/:id/messages',   { preHandler: resp, schema: { tags: ['admin:support'], summary: 'Post message/note to ticket', body: zodToJsonSchema(PostMessageSchema) }, handler: ctrl.postMessage });
  app.post('/v1/admin/support/tickets/:id/resolve',    { preHandler: resp, schema: { tags: ['admin:support'], summary: 'Resolve ticket', body: zodToJsonSchema(ResolveTicketSchema) }, handler: ctrl.resolveTicket });
};
