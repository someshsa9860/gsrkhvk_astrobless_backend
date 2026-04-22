// Admin consultation routes — list, detail, transcript, force end.

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminConsultations.controller.js';
import { ConsultationListQuerySchema, ForceEndSchema } from './adminConsultations.schema.js';

// ── Consultation management routes ────────────────────────────────────────────

export const adminConsultationsRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/consultations', {
    schema: {
      tags: ['admin:consultations'],
      summary: 'List consultations with filters',
      description: 'Filterable by status, type, customerId, astrologerId, and date range.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(ConsultationListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.CONSULTATION_VIEW)],
    handler: ctrl.listConsultations,
  });

  app.get('/v1/admin/consultations/:id', {
    schema: {
      tags: ['admin:consultations'],
      summary: 'Get full consultation record',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.CONSULTATION_VIEW)],
    handler: ctrl.getConsultation,
  });

  app.get('/v1/admin/consultations/:id/messages', {
    schema: {
      tags: ['admin:consultations'],
      summary: 'View consultation transcript',
      description: 'Returns paginated chat messages. Every access is written to the audit log.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.CONSULTATION_TRANSCRIPT_VIEW)],
    handler: ctrl.listMessages,
  });

  app.post('/v1/admin/consultations/:id/end', {
    schema: {
      tags: ['admin:consultations'],
      summary: 'Force-end a consultation',
      description: 'Terminates a stuck consultation. Requires reason.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(ForceEndSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.CONSULTATION_VIEW)],
    handler: ctrl.forceEnd,
  });
};
