// Dashboard routes — overview KPIs + geo distribution.

import type { FastifyPluginAsync } from 'fastify';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminDashboard.controller.js';

export const adminDashboardRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/dashboard/overview', {
    schema: {
      tags: ['admin:dashboard'],
      summary: 'Live dashboard KPIs',
      description: 'Returns real-time platform metrics: active consultations, online astrologers, new signups, pending KYC, and recent errors.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.DASHBOARD_VIEW)],
    handler: ctrl.getOverview,
  });

  app.get('/v1/admin/dashboard/geo-distribution', {
    schema: {
      tags: ['admin:dashboard'],
      summary: 'User registration geo distribution',
      description: 'Returns top countries/cities where customers and astrologers registered, derived from IP geolocation captured at signup.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.DASHBOARD_VIEW)],
    handler: ctrl.getGeoDistribution,
  });
};
