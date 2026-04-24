// Admin custom-roles management routes — CRUD for role definitions.

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminRoles.controller.js';
import { RoleListQuerySchema, CreateRoleSchema, UpdateRoleSchema } from './adminRoles.schema.js';

export const adminRolesRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/roles', {
    schema: {
      tags: ['admin:roles'],
      summary: 'List custom roles',
      description: 'Returns all admin-created custom roles with their permission sets.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(RoleListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ROLE_MANAGE)],
    handler: ctrl.listRoles,
  });

  app.post('/v1/admin/roles', {
    schema: {
      tags: ['admin:roles'],
      summary: 'Create a custom role',
      description: 'Creates a new role with a given slug and permission set. Slug cannot shadow built-in roles.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateRoleSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ROLE_MANAGE)],
    handler: ctrl.createRole,
  });

  app.get('/v1/admin/roles/:id', {
    schema: {
      tags: ['admin:roles'],
      summary: 'Get a single custom role',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ROLE_MANAGE)],
    handler: ctrl.getRole,
  });

  app.patch('/v1/admin/roles/:id', {
    schema: {
      tags: ['admin:roles'],
      summary: 'Update a custom role',
      description: 'Update name, description, or permissions. Permission changes are synced to all assigned admins.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateRoleSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ROLE_MANAGE)],
    handler: ctrl.updateRole,
  });

  app.delete('/v1/admin/roles/:id', {
    schema: {
      tags: ['admin:roles'],
      summary: 'Delete a custom role',
      description: 'Cannot delete if any admins are still assigned to this role.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ROLE_MANAGE)],
    handler: ctrl.deleteRole,
  });
};
