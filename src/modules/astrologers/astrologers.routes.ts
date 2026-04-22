import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './astrologers.controller.js';
import { UpdateAstrologerProfileSchema, SearchAstrologersQuerySchema, SetOnlineStatusSchema } from './astrologers.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const astrologerRoutes: FastifyPluginAsync = async (app) => {
  // ── Astrologer self-management ────────────────────────────────────────────
  app.get('/v1/astrologer/me', {
    schema: { tags: ['astrologer:profile'], summary: 'Get own profile', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: ctrl.getMyProfile,
  });

  app.patch('/v1/astrologer/me', {
    schema: {
      tags: ['astrologer:profile'],
      summary: 'Update own profile',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateAstrologerProfileSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: ctrl.updateMyProfile,
  });

  app.post('/v1/astrologer/me/status', {
    schema: {
      tags: ['astrologer:profile'],
      summary: 'Set online / offline status',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(SetOnlineStatusSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: ctrl.setOnlineStatus,
  });

  // ── Customer-facing astrologer discovery ─────────────────────────────────
  app.get('/v1/customer/astrologers', {
    schema: {
      tags: ['customer:astrologers'],
      summary: 'Search and browse astrologers',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(SearchAstrologersQuerySchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.searchAstrologers,
  });

  app.get('/v1/customer/astrologers/:id', {
    schema: {
      tags: ['customer:astrologers'],
      summary: 'Get astrologer public profile',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.getPublicProfile,
  });

  // ── Public catalog (no auth) ──────────────────────────────────────────────
  app.get('/v1/public/astrologers', {
    schema: {
      tags: ['public:horoscope'],
      summary: 'Public astrologer listing',
      querystring: zodToJsonSchema(SearchAstrologersQuerySchema),
    },
    handler: ctrl.searchAstrologers,
  });

  app.get('/v1/public/astrologers/:id', {
    schema: { tags: ['public:horoscope'], summary: 'Public astrologer profile' },
    handler: ctrl.getPublicProfile,
  });
};
