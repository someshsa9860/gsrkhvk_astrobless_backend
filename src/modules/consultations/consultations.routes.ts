import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './consultations.controller.js';
import { RequestConsultationSchema, EndConsultationSchema, SubmitReviewSchema, ConsultationQuerySchema } from './consultations.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const consultationRoutes: FastifyPluginAsync = async (app) => {
  // ── Customer routes ───────────────────────────────────────────────────────
  app.get('/v1/customer/consultations', {
    schema: { tags: ['customer:consultations'], summary: 'List my consultations', security: [{ bearerAuth: [] }], querystring: zodToJsonSchema(ConsultationQuerySchema) },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.getMyConsultations,
  });

  app.post('/v1/customer/consultations/request', {
    schema: { tags: ['customer:consultations'], summary: 'Request a consultation', security: [{ bearerAuth: [] }], body: zodToJsonSchema(RequestConsultationSchema) },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.requestConsultation,
  });

  app.post('/v1/customer/consultations/:id/start', {
    schema: { tags: ['customer:consultations'], summary: 'Mark consultation as started (first RTC frame)', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.startConsultation,
  });

  app.post('/v1/customer/consultations/:id/end', {
    schema: { tags: ['customer:consultations'], summary: 'End consultation', security: [{ bearerAuth: [] }], body: zodToJsonSchema(EndConsultationSchema) },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.endConsultation,
  });

  app.post('/v1/customer/consultations/:id/review', {
    schema: { tags: ['customer:consultations'], summary: 'Submit post-consultation review', security: [{ bearerAuth: [] }], body: zodToJsonSchema(SubmitReviewSchema) },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.submitReview,
  });

  // ── Astrologer routes ─────────────────────────────────────────────────────
  app.get('/v1/astrologer/consultations', {
    schema: { tags: ['astrologer:consultations'], summary: 'List my consultations', security: [{ bearerAuth: [] }], querystring: zodToJsonSchema(ConsultationQuerySchema) },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: ctrl.getMyConsultations,
  });

  app.post('/v1/astrologer/consultations/:id/accept', {
    schema: { tags: ['astrologer:consultations'], summary: 'Accept a consultation request', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: ctrl.acceptConsultation,
  });

  app.post('/v1/astrologer/consultations/:id/end', {
    schema: { tags: ['astrologer:consultations'], summary: 'End consultation', security: [{ bearerAuth: [] }], body: zodToJsonSchema(EndConsultationSchema) },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: ctrl.endConsultation,
  });
};
