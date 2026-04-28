import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import * as ctrl from './adminAstroMall.controller.js';
import {
  ProductListQuerySchema, CreateProductSchema, UpdateProductSchema, RestockSchema,
  OrderListQuerySchema, UpdateOrderStatusSchema, OrderRefundSchema,
} from './adminAstroMall.schema.js';

export const adminAstroMallRoutes: FastifyPluginAsync = async (app) => {
  const aud         = app.requireAudience(JWT_AUDIENCE.ADMIN);
  const productMgmt = [aud, requirePermission(AdminPermission.PRODUCT_MANAGE)];
  const orderView   = [aud, requirePermission(AdminPermission.ORDER_VIEW)];
  const orderMgmt   = [aud, requirePermission(AdminPermission.ORDER_MANAGE)];

  // ── Products ─────────────────────────────────────────────────────────────────
  app.get('/v1/admin/products',           { preHandler: productMgmt, schema: { tags: ['admin:astromall'], summary: 'List products',   querystring: zodToJsonSchema(ProductListQuerySchema) }, handler: ctrl.listProducts });
  app.get('/v1/admin/products/:id',       { preHandler: productMgmt, schema: { tags: ['admin:astromall'], summary: 'Get product' },   handler: ctrl.getProduct });
  app.post('/v1/admin/products',          { preHandler: productMgmt, schema: { tags: ['admin:astromall'], summary: 'Create product',  body: zodToJsonSchema(CreateProductSchema) }, handler: ctrl.createProduct });
  app.patch('/v1/admin/products/:id',     { preHandler: productMgmt, schema: { tags: ['admin:astromall'], summary: 'Update product',  body: zodToJsonSchema(UpdateProductSchema) }, handler: ctrl.updateProduct });
  app.delete('/v1/admin/products/:id',    { preHandler: productMgmt, schema: { tags: ['admin:astromall'], summary: 'Deactivate product' }, handler: ctrl.deleteProduct });
  app.post('/v1/admin/products/:id/restock', { preHandler: productMgmt, schema: { tags: ['admin:astromall'], summary: 'Restock product', body: zodToJsonSchema(RestockSchema) }, handler: ctrl.restockProduct });

  // ── Orders ───────────────────────────────────────────────────────────────────
  app.get('/v1/admin/orders',             { preHandler: orderView,   schema: { tags: ['admin:astromall'], summary: 'List orders',     querystring: zodToJsonSchema(OrderListQuerySchema) }, handler: ctrl.listOrders });
  app.get('/v1/admin/orders/:id',         { preHandler: orderView,   schema: { tags: ['admin:astromall'], summary: 'Get order' },     handler: ctrl.getOrder });
  app.patch('/v1/admin/orders/:id/status', { preHandler: orderMgmt,  schema: { tags: ['admin:astromall'], summary: 'Update order status', body: zodToJsonSchema(UpdateOrderStatusSchema) }, handler: ctrl.updateOrderStatus });
  app.post('/v1/admin/orders/:id/refund', { preHandler: orderMgmt,   schema: { tags: ['admin:astromall'], summary: 'Refund order',   body: zodToJsonSchema(OrderRefundSchema) }, handler: ctrl.refundOrder });
};
