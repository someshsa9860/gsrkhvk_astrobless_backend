import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminLanguages.controller.js';
import { LanguageListQuerySchema, CreateLanguageSchema, UpdateLanguageSchema } from './adminLanguages.schema.js';

export const adminLanguagesRoutes: FastifyPluginAsync = async (app) => {
  const aud   = app.requireAudience(JWT_AUDIENCE.ADMIN);
  const guard = [aud, requirePermission(AdminPermission.LANGUAGE_MANAGE)];
  const view  = [aud, requirePermission(AdminPermission.SETTINGS_VIEW)];

  app.get('/v1/admin/languages', {
    preHandler: view,
    schema: { tags: ['admin:languages'], summary: 'List languages', querystring: zodToJsonSchema(LanguageListQuerySchema) },
    handler: ctrl.listLanguages,
  });
  app.get('/v1/admin/languages/:id', {
    preHandler: view,
    schema: { tags: ['admin:languages'], summary: 'Get language' },
    handler: ctrl.getLanguage,
  });
  app.post('/v1/admin/languages', {
    preHandler: guard,
    schema: { tags: ['admin:languages'], summary: 'Create language', body: zodToJsonSchema(CreateLanguageSchema) },
    handler: ctrl.createLanguage,
  });
  app.patch('/v1/admin/languages/:id', {
    preHandler: guard,
    schema: { tags: ['admin:languages'], summary: 'Update language', body: zodToJsonSchema(UpdateLanguageSchema) },
    handler: ctrl.updateLanguage,
  });
  app.delete('/v1/admin/languages/:id', {
    preHandler: guard,
    schema: { tags: ['admin:languages'], summary: 'Delete language' },
    handler: ctrl.deleteLanguage,
  });
};
