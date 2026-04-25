import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminSkills.controller.js';
import { SkillListQuerySchema, CreateSkillSchema, UpdateSkillSchema } from './adminSkills.schema.js';

export const adminSkillsRoutes: FastifyPluginAsync = async (app) => {
  const aud   = app.requireAudience(JWT_AUDIENCE.ADMIN);
  const guard = [aud, requirePermission(AdminPermission.SKILL_MANAGE)];
  const view  = [aud, requirePermission(AdminPermission.SETTINGS_VIEW)];

  app.get('/v1/admin/skills', {
    preHandler: view,
    schema: { tags: ['admin:skills'], summary: 'List skills', querystring: zodToJsonSchema(SkillListQuerySchema) },
    handler: ctrl.listSkills,
  });
  app.get('/v1/admin/skills/:id', {
    preHandler: view,
    schema: { tags: ['admin:skills'], summary: 'Get skill' },
    handler: ctrl.getSkill,
  });
  app.post('/v1/admin/skills', {
    preHandler: guard,
    schema: { tags: ['admin:skills'], summary: 'Create skill', body: zodToJsonSchema(CreateSkillSchema) },
    handler: ctrl.createSkill,
  });
  app.patch('/v1/admin/skills/:id', {
    preHandler: guard,
    schema: { tags: ['admin:skills'], summary: 'Update skill', body: zodToJsonSchema(UpdateSkillSchema) },
    handler: ctrl.updateSkill,
  });
  app.delete('/v1/admin/skills/:id', {
    preHandler: guard,
    schema: { tags: ['admin:skills'], summary: 'Delete skill' },
    handler: ctrl.deleteSkill,
  });
};
