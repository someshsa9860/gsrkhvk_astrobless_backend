// Admin finance routes: transactions ledger, payouts, payout approval.

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminFinance.controller.js';
import {
  TransactionListQuerySchema,
  PayoutListQuerySchema,
  ApprovePayoutSchema,
  PaymentOrderListQuerySchema,
} from './adminFinance.schema.js';

// ── Finance routes ────────────────────────────────────────────────────────────

export const adminFinanceRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/finance/transactions', {
    schema: {
      tags: ['admin:finance'],
      summary: 'List wallet transactions (ledger view)',
      description: 'Flat ledger view of all walletTransactions rows. Filterable by type, direction, customerId.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(TransactionListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.PAYMENT_VIEW)],
    handler: ctrl.listTransactions,
  });

  app.get('/v1/admin/finance/payouts', {
    schema: {
      tags: ['admin:finance'],
      summary: 'List astrologer payouts',
      description: 'Paginated list of astrologer payout batches. Filterable by status and astrologerId.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(PayoutListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.PAYOUT_VIEW)],
    handler: ctrl.listPayouts,
  });

  app.post('/v1/admin/finance/payouts/:id/approve', {
    schema: {
      tags: ['admin:finance'],
      summary: 'Approve a queued payout',
      description: 'Moves payout status to processing, triggering the provider call in a downstream job.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(ApprovePayoutSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.PAYOUT_APPROVE)],
    handler: ctrl.approvePayout,
  });

  app.get('/v1/admin/finance/payment-orders', {
    schema: {
      tags: ['admin:finance'],
      summary: 'List payment orders',
      description: 'All top-up payment orders across all providers and platforms. Filterable by status, provider, platform, customerId, date range.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(PaymentOrderListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.PAYMENT_VIEW)],
    handler: ctrl.listPaymentOrders,
  });

  app.get('/v1/admin/finance/payment-orders/:id', {
    schema: {
      tags: ['admin:finance'],
      summary: 'Get a single payment order',
      description: 'Full payment order detail including customer info, webhook payloads, and IAP transaction ID.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.PAYMENT_VIEW)],
    handler: ctrl.getPaymentOrder,
  });
};
