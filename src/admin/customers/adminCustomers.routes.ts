// Admin customer management routes — all behind audience guard + permission checks.

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission } from '../shared/rbac.js';
import { AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminCustomers.controller.js';
import {
  CustomerListQuerySchema,
  BlockCustomerSchema,
  WalletAdjustSchema,
} from './adminCustomers.schema.js';

// ── Customer management routes ────────────────────────────────────────────────

export const adminCustomersRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/customers', {
    schema: {
      tags: ['admin:customers'],
      summary: 'List customers with filters and pagination',
      description: 'Returns a paginated list of customers. Supports free-text search, blocked filter, and signup date range.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(CustomerListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.CUSTOMER_VIEW)],
    handler: ctrl.listCustomers,
  });

  app.get('/v1/admin/customers/:id', {
    schema: {
      tags: ['admin:customers'],
      summary: 'Get a single customer with wallet and stats',
      description: 'Returns full customer profile including wallet balance and lifetime consultation stats.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.CUSTOMER_VIEW)],
    handler: ctrl.getCustomer,
  });

  app.post('/v1/admin/customers/:id/block', {
    schema: {
      tags: ['admin:customers'],
      summary: 'Block a customer',
      description: 'Soft-blocks the customer. Requires a reason for the audit trail.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(BlockCustomerSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.CUSTOMER_BLOCK)],
    handler: ctrl.blockCustomer,
  });

  app.post('/v1/admin/customers/:id/unblock', {
    schema: {
      tags: ['admin:customers'],
      summary: 'Unblock a customer',
      description: 'Removes the block flag and clears the blocked reason.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.CUSTOMER_BLOCK)],
    handler: ctrl.unblockCustomer,
  });

  app.post('/v1/admin/customers/:id/wallet/credit', {
    schema: {
      tags: ['admin:customers'],
      summary: 'Manually credit a customer wallet',
      description: 'Creates a ledger credit row and updates wallet balance. Requires reason and type. Finance and superAdmin only.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(WalletAdjustSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.CUSTOMER_WALLET_ADJUST)],
    handler: ctrl.walletCredit,
  });
};
