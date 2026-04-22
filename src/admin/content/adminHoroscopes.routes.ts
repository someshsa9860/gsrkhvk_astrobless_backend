import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { requirePermission } from '../shared/rbac.js';
import { AdminPermission } from '../shared/rbac.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import * as ctrl from './adminHoroscopes.controller.js';
import {
  HoroscopeListQuerySchema,
  CreateHoroscopeSchema,
  UpdateHoroscopeSchema,
  BulkGenerateSchema,
} from './adminHoroscopes.schema.js';

export const adminHoroscopesRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);
  const guard = [audience, requirePermission(AdminPermission.HOROSCOPE_MANAGE)];

  // ── List ──────────────────────────────────────────────────────────────────
  app.get('/v1/admin/horoscopes', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'List horoscopes',
      description: 'Paginated list of horoscopes with optional filters.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(HoroscopeListQuerySchema),
    },
    handler: ctrl.listHoroscopes,
  });

  // ── Get one ───────────────────────────────────────────────────────────────
  app.get('/v1/admin/horoscopes/:id', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'Get horoscope by ID',
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.getHoroscope,
  });

  // ── Create ────────────────────────────────────────────────────────────────
  app.post('/v1/admin/horoscopes', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'Create a horoscope manually',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateHoroscopeSchema),
    },
    handler: ctrl.createHoroscope,
  });

  // ── Update ────────────────────────────────────────────────────────────────
  app.patch('/v1/admin/horoscopes/:id', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'Update a horoscope',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateHoroscopeSchema),
    },
    handler: ctrl.updateHoroscope,
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  app.delete('/v1/admin/horoscopes/:id', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'Delete a horoscope',
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.deleteHoroscope,
  });

  // ── Publish / Unpublish ───────────────────────────────────────────────────
  app.post('/v1/admin/horoscopes/:id/publish', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'Publish a horoscope',
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.publishHoroscope,
  });

  app.post('/v1/admin/horoscopes/:id/unpublish', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'Unpublish a horoscope',
      security: [{ bearerAuth: [] }],
    },
    handler: ctrl.unpublishHoroscope,
  });

  // ── Bulk generate ─────────────────────────────────────────────────────────
  app.post('/v1/admin/horoscopes/bulk-generate', {
    preHandler: guard,
    schema: {
      tags: ['admin:content'],
      summary: 'Trigger bulk AI/VedicAPI horoscope generation',
      description: 'Enqueues a background job that generates horoscopes for all 12 signs. Returns immediately.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(BulkGenerateSchema),
    },
    handler: ctrl.bulkGenerate,
  });
};
