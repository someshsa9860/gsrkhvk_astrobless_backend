// Admin management routes: CRUD for admin accounts, plus /me for the current admin.

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminAdmins.controller.js';
import { AdminListQuerySchema, CreateAdminSchema, UpdateAdminSchema } from './adminAdmins.schema.js';

// ── Admin account management routes ──────────────────────────────────────────

export const adminAdminsRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  // /me must come before /:id to avoid the param swallowing "me" as an id.
  app.get('/v1/admin/me', {
    schema: {
      tags: ['admin:admins'],
      summary: 'Get current admin profile',
      description: "Returns the authenticated admin's own profile (no passwordHash).",
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience],
    handler: ctrl.getMe,
  });

  app.get('/v1/admin/admins', {
    schema: {
      tags: ['admin:admins'],
      summary: 'List admin accounts',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(AdminListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ADMIN_MANAGE)],
    handler: ctrl.listAdmins,
  });

  app.post('/v1/admin/admins', {
    schema: {
      tags: ['admin:admins'],
      summary: 'Create a new admin account',
      description: 'superAdmin only. Creates admin and writes audit log.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateAdminSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ADMIN_MANAGE)],
    handler: ctrl.createAdmin,
  });

  app.get('/v1/admin/admins/:id', {
    schema: {
      tags: ['admin:admins'],
      summary: 'Get a single admin account',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ADMIN_MANAGE)],
    handler: ctrl.getAdmin,
  });

  app.patch('/v1/admin/admins/:id', {
    schema: {
      tags: ['admin:admins'],
      summary: 'Update an admin account',
      description: 'Can update name, role, isActive, and customPermissions. Audited.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateAdminSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ADMIN_MANAGE)],
    handler: ctrl.updateAdmin,
  });

  app.post('/v1/admin/admins/:id/deactivate', {
    schema: {
      tags: ['admin:admins'],
      summary: 'Deactivate an admin account',
      description: 'Soft-deactivates. Cannot deactivate your own account.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ADMIN_MANAGE)],
    handler: ctrl.deactivateAdmin,
  });
};
