import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './wallet.controller.js';
import { TopupSchema, WalletTransactionQuerySchema } from './wallet.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const walletRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/customer/wallet';
  const guard = app.requireAudience(JWT_AUDIENCE.CUSTOMER);

  app.get(`${prefix}`, {
    schema: { tags: ['customer:wallet'], summary: 'Get wallet balance', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: ctrl.getWallet,
  });

  app.get(`${prefix}/providers`, {
    schema: { tags: ['customer:wallet'], summary: 'List available top-up providers', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: ctrl.getProviders,
  });

  app.post(`${prefix}/topup`, {
    schema: {
      tags: ['customer:wallet'],
      summary: 'Initiate wallet top-up',
      description: 'Creates a paymentOrder and returns a clientPayload for the chosen provider SDK.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(TopupSchema),
    },
    preHandler: [guard],
    handler: ctrl.initiateTopup,
  });

  app.get(`${prefix}/transactions`, {
    schema: {
      tags: ['customer:wallet'],
      summary: 'Paginated wallet transaction history',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(WalletTransactionQuerySchema),
    },
    preHandler: [guard],
    handler: ctrl.getTransactions,
  });
};
