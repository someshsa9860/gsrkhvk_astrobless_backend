import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './customers.controller.js';
import * as notifCtrl from './notifications.controller.js';
import * as addrCtrl from './addresses.controller.js';
import * as supportCtrl from './support.controller.js';
import { UpdateProfileSchema } from './customers.schema.js';
import { RegisterFcmTokenSchema, ListNotificationsQuerySchema, MarkReadSchema } from './notifications.schema.js';
import { CreateAddressSchema, UpdateAddressSchema } from './addresses.schema.js';
import { CreateSupportTicketSchema, ListTicketsQuerySchema, AddTicketMessageSchema } from './support.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const customerRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/customer';
  const guard = app.requireAudience(JWT_AUDIENCE.CUSTOMER);

  // ── Profile ───────────────────────────────────────────────────────────────
  app.get(`${prefix}/me`, {
    schema: { tags: ['customer:profile'], summary: 'Get current customer profile', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: ctrl.getProfile,
  });

  app.patch(`${prefix}/me`, {
    schema: {
      tags: ['customer:profile'],
      summary: 'Update customer profile',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateProfileSchema),
    },
    preHandler: [guard],
    handler: ctrl.updateProfile,
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  app.get(`${prefix}/notifications`, {
    schema: {
      tags: ['customer:notifications'],
      summary: 'List notifications',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(ListNotificationsQuerySchema),
    },
    preHandler: [guard],
    handler: notifCtrl.listNotifications,
  });

  app.get(`${prefix}/notifications/unread-count`, {
    schema: { tags: ['customer:notifications'], summary: 'Get unread notification count', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: notifCtrl.getUnreadCount,
  });

  app.post(`${prefix}/notifications/mark-read`, {
    schema: {
      tags: ['customer:notifications'],
      summary: 'Mark specific notifications as read',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(MarkReadSchema),
    },
    preHandler: [guard],
    handler: notifCtrl.markRead,
  });

  app.post(`${prefix}/notifications/mark-all-read`, {
    schema: { tags: ['customer:notifications'], summary: 'Mark all notifications as read', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: notifCtrl.markAllRead,
  });

  // ── FCM tokens ────────────────────────────────────────────────────────────
  app.post(`${prefix}/fcm-tokens`, {
    schema: {
      tags: ['customer:notifications'],
      summary: 'Register FCM token',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(RegisterFcmTokenSchema),
    },
    preHandler: [guard],
    handler: notifCtrl.registerFcmToken,
  });

  app.delete(`${prefix}/fcm-tokens/:token`, {
    schema: { tags: ['customer:notifications'], summary: 'Remove FCM token', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: notifCtrl.deleteFcmToken,
  });

  // ── Addresses ─────────────────────────────────────────────────────────────
  app.get(`${prefix}/addresses`, {
    schema: { tags: ['customer:addresses'], summary: 'List saved addresses', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: addrCtrl.listAddresses,
  });

  app.post(`${prefix}/addresses`, {
    schema: {
      tags: ['customer:addresses'],
      summary: 'Add a new address',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateAddressSchema),
    },
    preHandler: [guard],
    handler: addrCtrl.createAddress,
  });

  app.get(`${prefix}/addresses/:id`, {
    schema: { tags: ['customer:addresses'], summary: 'Get address by ID', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: addrCtrl.getAddress,
  });

  app.patch(`${prefix}/addresses/:id`, {
    schema: {
      tags: ['customer:addresses'],
      summary: 'Update address',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateAddressSchema),
    },
    preHandler: [guard],
    handler: addrCtrl.updateAddress,
  });

  app.delete(`${prefix}/addresses/:id`, {
    schema: { tags: ['customer:addresses'], summary: 'Delete address', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: addrCtrl.deleteAddress,
  });

  app.post(`${prefix}/addresses/:id/set-default`, {
    schema: { tags: ['customer:addresses'], summary: 'Set address as default', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: addrCtrl.setDefaultAddress,
  });

  // ── Support tickets ───────────────────────────────────────────────────────
  app.post(`${prefix}/support/tickets`, {
    schema: {
      tags: ['customer:support'],
      summary: 'Create support ticket',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateSupportTicketSchema),
    },
    preHandler: [guard],
    handler: supportCtrl.createTicket,
  });

  app.get(`${prefix}/support/tickets`, {
    schema: {
      tags: ['customer:support'],
      summary: 'List support tickets',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(ListTicketsQuerySchema),
    },
    preHandler: [guard],
    handler: supportCtrl.listTickets,
  });

  app.get(`${prefix}/support/tickets/:id`, {
    schema: { tags: ['customer:support'], summary: 'Get support ticket detail', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: supportCtrl.getTicket,
  });

  app.post(`${prefix}/support/tickets/:id/messages`, {
    schema: {
      tags: ['customer:support'],
      summary: 'Reply to support ticket',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(AddTicketMessageSchema),
    },
    preHandler: [guard],
    handler: supportCtrl.addMessage,
  });

  app.post(`${prefix}/support/tickets/:id/close`, {
    schema: { tags: ['customer:support'], summary: 'Close support ticket', security: [{ bearerAuth: [] }] },
    preHandler: [guard],
    handler: supportCtrl.closeTicket,
  });
};
