import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './astrologers.controller.js';
import * as notifCtrl from './notifications.controller.js';
import * as supportCtrl from './support.controller.js';
import { UpdateAstrologerProfileSchema, SearchAstrologersQuerySchema, SetOnlineStatusSchema } from './astrologers.schema.js';
import { RegisterFcmTokenSchema, ListNotificationsQuerySchema, MarkReadSchema } from './notifications.schema.js';
import { CreateSupportTicketSchema, ListTicketsQuerySchema, AddTicketMessageSchema } from './support.schema.js';
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

  // ── Notifications ─────────────────────────────────────────────────────────
  app.get('/v1/astrologer/notifications', {
    schema: {
      tags: ['astrologer:notifications'],
      summary: 'List notifications',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(ListNotificationsQuerySchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: notifCtrl.listNotifications,
  });

  app.get('/v1/astrologer/notifications/unread-count', {
    schema: { tags: ['astrologer:notifications'], summary: 'Get unread notification count', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: notifCtrl.getUnreadCount,
  });

  app.post('/v1/astrologer/notifications/mark-read', {
    schema: {
      tags: ['astrologer:notifications'],
      summary: 'Mark specific notifications as read',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(MarkReadSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: notifCtrl.markRead,
  });

  app.post('/v1/astrologer/notifications/mark-all-read', {
    schema: { tags: ['astrologer:notifications'], summary: 'Mark all notifications as read', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: notifCtrl.markAllRead,
  });

  // ── FCM tokens ────────────────────────────────────────────────────────────
  app.post('/v1/astrologer/fcm-tokens', {
    schema: {
      tags: ['astrologer:notifications'],
      summary: 'Register FCM token',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(RegisterFcmTokenSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: notifCtrl.registerFcmToken,
  });

  app.delete('/v1/astrologer/fcm-tokens/:token', {
    schema: { tags: ['astrologer:notifications'], summary: 'Remove FCM token', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: notifCtrl.deleteFcmToken,
  });

  // ── Support tickets ───────────────────────────────────────────────────────
  app.post('/v1/astrologer/support/tickets', {
    schema: {
      tags: ['astrologer:support'],
      summary: 'Create support ticket',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateSupportTicketSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: supportCtrl.createTicket,
  });

  app.get('/v1/astrologer/support/tickets', {
    schema: {
      tags: ['astrologer:support'],
      summary: 'List my support tickets',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(ListTicketsQuerySchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: supportCtrl.listTickets,
  });

  app.get('/v1/astrologer/support/tickets/:id', {
    schema: { tags: ['astrologer:support'], summary: 'Get support ticket detail', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: supportCtrl.getTicket,
  });

  app.post('/v1/astrologer/support/tickets/:id/messages', {
    schema: {
      tags: ['astrologer:support'],
      summary: 'Reply to support ticket',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(AddTicketMessageSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: supportCtrl.addMessage,
  });

  app.post('/v1/astrologer/support/tickets/:id/close', {
    schema: { tags: ['astrologer:support'], summary: 'Close support ticket', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: supportCtrl.closeTicket,
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

  // /trending must be registered before /:id so Fastify matches it as a static segment
  app.get('/v1/public/astrologers/trending', {
    schema: {
      tags: ['public:horoscope'],
      summary: 'Top trending astrologers (sorted by rating, limit 10)',
      querystring: zodToJsonSchema(SearchAstrologersQuerySchema),
    },
    handler: ctrl.getTrendingAstrologers,
  });

  app.get('/v1/public/astrologers/:id', {
    schema: { tags: ['public:horoscope'], summary: 'Public astrologer profile' },
    handler: ctrl.getPublicProfile,
  });
};
