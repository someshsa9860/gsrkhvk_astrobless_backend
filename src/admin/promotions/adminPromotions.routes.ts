import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import * as ctrl from './adminPromotions.controller.js';
import {
  CreateRechargePackSchema, UpdateRechargePackSchema,
  CouponListQuerySchema, CreateCouponSchema, UpdateCouponSchema,
} from './adminPromotions.schema.js';

export const adminPromotionsRoutes: FastifyPluginAsync = async (app) => {
  const aud  = app.requireAudience(JWT_AUDIENCE.ADMIN);
  const settingsGuard = [aud, requirePermission(AdminPermission.SETTINGS_EDIT)];

  // ── Recharge Packs ──────────────────────────────────────────────────────────
  app.get('/v1/admin/recharge-packs',      { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'List recharge packs' }, handler: ctrl.listRechargePacks });
  app.post('/v1/admin/recharge-packs',     { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'Create recharge pack', body: zodToJsonSchema(CreateRechargePackSchema) }, handler: ctrl.createRechargePack });
  app.patch('/v1/admin/recharge-packs/:id', { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'Update recharge pack', body: zodToJsonSchema(UpdateRechargePackSchema) }, handler: ctrl.updateRechargePack });
  app.delete('/v1/admin/recharge-packs/:id', { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'Delete recharge pack' }, handler: ctrl.deleteRechargePack });

  // ── Coupons ─────────────────────────────────────────────────────────────────
  app.get('/v1/admin/coupons',      { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'List coupons', querystring: zodToJsonSchema(CouponListQuerySchema) }, handler: ctrl.listCoupons });
  app.get('/v1/admin/coupons/:id',  { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'Get coupon' }, handler: ctrl.getCoupon });
  app.post('/v1/admin/coupons',     { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'Create coupon', body: zodToJsonSchema(CreateCouponSchema) }, handler: ctrl.createCoupon });
  app.patch('/v1/admin/coupons/:id', { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'Update coupon', body: zodToJsonSchema(UpdateCouponSchema) }, handler: ctrl.updateCoupon });
  app.delete('/v1/admin/coupons/:id', { preHandler: settingsGuard, schema: { tags: ['admin:promotions'], summary: 'Delete coupon' }, handler: ctrl.deleteCoupon });
};
