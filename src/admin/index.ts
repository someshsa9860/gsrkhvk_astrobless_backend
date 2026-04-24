// Parent Fastify plugin that registers all admin sub-route modules.
// Each sub-module uses its full /v1/admin/... path so routes are explicit and greppable.

import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { adminCustomersRoutes } from './customers/adminCustomers.routes.js';
import { adminAstrologersRoutes } from './astrologers/adminAstrologers.routes.js';
import { adminConsultationsRoutes } from './consultations/adminConsultations.routes.js';
import { adminFinanceRoutes } from './finance/adminFinance.routes.js';
import { adminDashboardRoutes } from './dashboard/adminDashboard.routes.js';
import { adminObservabilityRoutes } from './observability/adminObservability.routes.js';
import { adminSettingsRoutes } from './settings/adminSettings.routes.js';
import { adminAdminsRoutes } from './admins/adminAdmins.routes.js';
import { adminHoroscopesRoutes } from './content/adminHoroscopes.routes.js';
import { adminImageAspectRatioRoutes } from './settings/imageAspectRatio.routes.js';
import { adminNotificationsRoutes } from './notifications/adminNotifications.routes.js';
import { adminRolesRoutes } from './roles/adminRoles.routes.js';

const adminPluginImpl: FastifyPluginAsync = async (app) => {
  await app.register(adminDashboardRoutes);
  await app.register(adminCustomersRoutes);
  await app.register(adminAstrologersRoutes);
  await app.register(adminConsultationsRoutes);
  await app.register(adminFinanceRoutes);
  await app.register(adminObservabilityRoutes);
  await app.register(adminSettingsRoutes);
  await app.register(adminImageAspectRatioRoutes);
  await app.register(adminAdminsRoutes);
  await app.register(adminHoroscopesRoutes);
  await app.register(adminNotificationsRoutes);
  await app.register(adminRolesRoutes);
};

// Wrapped with fastify-plugin so decorators and hooks added by sub-plugins are
// visible to the parent app rather than scoped to an encapsulated child context.
export const adminPlugin = fp(adminPluginImpl, { name: 'admin' });
