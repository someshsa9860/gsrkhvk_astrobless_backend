import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { CreateKundliProfileSchema } from './kundli.schema.js';
import * as service from './kundli.service.js';

export const kundliRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/customer/kundli';

  app.get(`${prefix}/profiles`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'List saved Kundli profiles',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const profiles = await service.listProfiles(req.requestContext.actorId!);
      return reply.send({ ok: true, data: profiles, traceId: req.requestContext.traceId });
    },
  });

  app.post(`${prefix}/profiles`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Create a Kundli profile from birth details',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateKundliProfileSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const body = req.body as ReturnType<typeof CreateKundliProfileSchema.parse>;
      const profile = await service.createProfile(req.requestContext.actorId!, body);
      return reply.status(201).send({ ok: true, data: profile, traceId: req.requestContext.traceId });
    },
  });

  app.get(`${prefix}/profiles/:id`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Get a single Kundli profile',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const profile = await service.getProfile(req.requestContext.actorId!, id);
      return reply.send({ ok: true, data: profile, traceId: req.requestContext.traceId });
    },
  });

  app.delete(`${prefix}/profiles/:id`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Delete a Kundli profile',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      await service.deleteProfile(req.requestContext.actorId!, id);
      return reply.send({ ok: true, traceId: req.requestContext.traceId });
    },
  });

  app.get(`${prefix}/profiles/:id/report`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Get (or generate) the Kundli chart report. Cached after first computation.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const result = await service.getReport(req.requestContext.actorId!, id);
      return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
    },
  });
};
