// Admin astrologer management routes — list, detail, KYC, block/unblock, commission.

import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import * as ctrl from './adminAstrologers.controller.js';
import {
  AstrologerListQuerySchema,
  KycDecisionSchema,
  BlockAstrologerSchema,
  CommissionOverrideSchema,
  CreateAstrologerSchema,
  UpdateAstrologerSchema,
} from './adminAstrologers.schema.js';

// ── Astrologer management routes ──────────────────────────────────────────────

export const adminAstrologersRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/astrologers', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'List astrologers with filters',
      description: 'Paginated list filterable by kycStatus, isOnline, isBlocked, and free-text search.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(AstrologerListQuerySchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_VIEW)],
    handler: ctrl.listAstrologers,
  });

  app.post('/v1/admin/astrologers', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Create an astrologer account',
      description: 'Admin creates an astrologer profile directly. Either phone or email is required.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateAstrologerSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_EDIT)],
    handler: ctrl.createAstrologer,
  });

  app.get('/v1/admin/astrologers/:id', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Get a single astrologer',
      description: 'Returns full astrologer profile including KYC and bank refs.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_VIEW)],
    handler: ctrl.getAstrologer,
  });

  app.post('/v1/admin/astrologers/:id/kyc/decide', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Approve or reject astrologer KYC',
      description: 'Sets kycStatus and flips isVerified accordingly. Fully audited.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(KycDecisionSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_KYC_REVIEW)],
    handler: ctrl.decideKyc,
  });

  app.post('/v1/admin/astrologers/:id/block', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Block an astrologer',
      description: 'Soft-blocks and forces them offline. Requires reason.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(BlockAstrologerSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_BLOCK)],
    handler: ctrl.blockAstrologer,
  });

  app.post('/v1/admin/astrologers/:id/unblock', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Unblock an astrologer',
      description: 'Removes the block flag; astrologer must re-set themselves online.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_BLOCK)],
    handler: ctrl.unblockAstrologer,
  });

  app.patch('/v1/admin/astrologers/:id', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Update astrologer profile fields',
      description: 'Partial update of any editable astrologer fields. All fields are optional.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateAstrologerSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_EDIT)],
    handler: ctrl.updateAstrologer,
  });

  app.delete('/v1/admin/astrologers/:id', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Soft-delete an astrologer',
      description: 'Blocks the astrologer and marks them as deleted. Not reversible via normal flows.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_EDIT)],
    handler: ctrl.deleteAstrologer,
  });

  app.post('/v1/admin/astrologers/:id/commission', {
    schema: {
      tags: ['admin:astrologers'],
      summary: 'Override astrologer commission percentage',
      description: 'Sets a per-astrologer commission rate that overrides the platform default.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CommissionOverrideSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.ASTROLOGER_EDIT)],
    handler: ctrl.overrideCommission,
  });
};
