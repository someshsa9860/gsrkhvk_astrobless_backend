import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import * as ctrl from './adminBanners.controller.js';
import { BannerListQuerySchema, CreateBannerSchema, UpdateBannerSchema } from './adminBanners.schema.js';

export const adminBannersRoutes: FastifyPluginAsync = async (app) => {
  const guard = [app.requireAudience(JWT_AUDIENCE.ADMIN), requirePermission(AdminPermission.BANNER_MANAGE)];

  app.get('/v1/admin/banners', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'List banners', querystring: zodToJsonSchema(BannerListQuerySchema) }, handler: ctrl.listBanners });
  app.get('/v1/admin/banners/:id', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Get banner' }, handler: ctrl.getBanner });
  app.post('/v1/admin/banners', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Create banner', body: zodToJsonSchema(CreateBannerSchema) }, handler: ctrl.createBanner });
  app.patch('/v1/admin/banners/:id', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Update banner', body: zodToJsonSchema(UpdateBannerSchema) }, handler: ctrl.updateBanner });
  app.delete('/v1/admin/banners/:id', { preHandler: guard, schema: { tags: ['admin:content'], summary: 'Delete banner' }, handler: ctrl.deleteBanner });
};
