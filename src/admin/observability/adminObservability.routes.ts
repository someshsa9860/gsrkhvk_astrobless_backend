// Admin observability routes: errors, error stats, resolve/reopen, audit log.

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminObservability.controller.js';
import {
  ErrorListQuerySchema,
  AuditQuerySchema,
  ResolveErrorSchema,
} from './adminObservability.schema.js';

// ── Observability routes ──────────────────────────────────────────────────────

export const adminObservabilityRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  // Stats endpoint must be registered before the :id param route to avoid routing conflict.
  app.get('/v1/admin/observability/errors/stats', {
    schema: {
      tags: ['admin:observability'],
      summary: 'System error aggregates by severity and source',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ERROR_VIEW)],
    handler: ctrl.getErrorStats,
  });

  app.get('/v1/admin/observability/errors', {
    schema: {
      tags: ['admin:observability'],
      summary: 'List system errors',
      description: 'Grouped and paginated error list. Access itself is audited.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(ErrorListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ERROR_VIEW)],
    handler: ctrl.listErrors,
  });

  app.get('/v1/admin/observability/errors/:id', {
    schema: {
      tags: ['admin:observability'],
      summary: 'Get single error detail',
      description: 'Full stack trace, metadata, occurrence history. Access audited.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ERROR_VIEW)],
    handler: ctrl.getError,
  });

  app.post('/v1/admin/observability/errors/:id/resolve', {
    schema: {
      tags: ['admin:observability'],
      summary: 'Resolve a system error',
      description: 'Marks error as resolved with optional note. Future occurrences reopen it.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(ResolveErrorSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ERROR_RESOLVE)],
    handler: ctrl.resolveError,
  });

  app.post('/v1/admin/observability/errors/:id/reopen', {
    schema: {
      tags: ['admin:observability'],
      summary: 'Reopen a resolved error',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ERROR_RESOLVE)],
    handler: ctrl.reopenError,
  });

  app.get('/v1/admin/observability/audit', {
    schema: {
      tags: ['admin:observability'],
      summary: 'View audit trail',
      description: 'Paginated business audit log. Filterable by actor, action, target. Access is itself audited.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(AuditQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.AUDIT_VIEW)],
    handler: ctrl.listAuditLog,
  });
};
