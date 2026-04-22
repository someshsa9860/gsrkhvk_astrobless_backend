// Admin settings routes: list, get, patch (upsert).

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminSettings.controller.js';
import { UpsertSettingSchema } from './adminSettings.schema.js';

// ── Settings routes ───────────────────────────────────────────────────────────

export const adminSettingsRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/settings', {
    schema: {
      tags: ['admin:settings'],
      summary: 'List all app settings',
      description: 'Returns key-value config store. Sensitive values masked unless superAdmin.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.SETTINGS_VIEW)],
    handler: ctrl.listSettings,
  });

  app.get('/v1/admin/settings/:key', {
    schema: {
      tags: ['admin:settings'],
      summary: 'Get a single app setting by key',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.SETTINGS_VIEW)],
    handler: ctrl.getSetting,
  });

  app.patch('/v1/admin/settings/:key', {
    schema: {
      tags: ['admin:settings'],
      summary: 'Create or update a setting',
      description: 'Upserts a key-value setting. Requires reason for audit. Some keys are superAdmin-only.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpsertSettingSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.SETTINGS_EDIT)],
    handler: ctrl.upsertSetting,
  });
};
