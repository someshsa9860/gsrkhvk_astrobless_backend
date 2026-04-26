import type { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { CreateKundliProfileSchema } from './kundli.schema.js';
import type { AshtakvargaPlanet, DivisionalDiv } from '../../lib/vedicAstroClient.js';
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
      summary: 'Get (or generate) the Kundli chart report. Cached after first computation. Pass ?refresh=true to force regeneration (dev only).',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const { refresh } = req.query as { refresh?: string };
      const forceRefresh = refresh === 'true';
      const result = await service.getReport(req.requestContext.actorId!, id, forceRefresh);
      return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
    },
  });

  // Ashtakvarga — fetched fresh on every call (not cached in DB)
  // planet: Sun | Moon | Mars | Mercury | Jupiter | Venus | Saturn | total (default)
  app.get(`${prefix}/profiles/:id/ashtakvarga`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Get Ashtakvarga bindus + chart image for a planet. Not cached.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const { planet = 'total' } = req.query as { planet?: string };
      const validPlanets: AshtakvargaPlanet[] = [
        'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'total',
      ];
      const safePlanet = validPlanets.includes(planet as AshtakvargaPlanet)
        ? (planet as AshtakvargaPlanet)
        : 'total';
      const result = await service.getAshtakvargaForProfile(req.requestContext.actorId!, id, safePlanet);
      return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
    },
  });

  // Divisional chart — fetched fresh, planets placed according to the chosen div
  // div: D1 (Lagna) | D9 (Navamsa) | D10 (Dasamsa) | etc.
  app.get(`${prefix}/profiles/:id/divisional`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Get divisional chart (D1/D9/etc.) planet positions. Not cached.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const { div = 'D1' } = req.query as { div?: string };
      const validDivs: DivisionalDiv[] = [
        'D1','D2','D3','D4','D5','D6','D7','D8','D9','D10',
        'D11','D12','D16','D20','D24','D27','D30','D40','D45','D60',
      ];
      const safeDiv = validDivs.includes(div as DivisionalDiv) ? (div as DivisionalDiv) : 'D1';
      const result = await service.getDivisionalChartForProfile(req.requestContext.actorId!, id, safeDiv);
      return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
    },
  });

  // Full mahadasha + antardasha hierarchy — fetched fresh on each call
  app.get(`${prefix}/profiles/:id/dasha`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Get full Vimshottari dasha hierarchy (maha + antar). Not cached.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const result = await service.getFullDashaForProfile(req.requestContext.actorId!, id);
      return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
    },
  });

  // Specific sub-dasha drill-down: paryantar/sookshma/prana levels
  // Query params: md, ad, pd, sd (planet names e.g. Sun, Moon, Mars...)
  app.get(`${prefix}/profiles/:id/dasha/specific`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Get specific sub-dasha levels (paryantar/sookshma/prana). Not cached.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const { md = 'Sun', ad = 'Sun', pd = 'Sun', sd = 'Sun' } = req.query as Record<string, string>;
      const result = await service.getSpecificSubDashaForProfile(
        req.requestContext.actorId!, id, md, ad, pd, sd,
      );
      return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
    },
  });

  // ── Kundli matching ──────────────────────────────────────────────────────────

  app.post(`${prefix}/match`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Compute Ashtakoot compatibility between two saved Kundli profiles (cached)',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { profileAId, profileBId } = req.body as { profileAId: string; profileBId: string };
      const result = await service.matchKundli(req.requestContext.actorId!, profileAId, profileBId);
      return reply.status(201).send({ ok: true, data: result, traceId: req.requestContext.traceId });
    },
  });

  app.get(`${prefix}/matches`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'List previous Kundli match results',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const results = await service.listMatches(req.requestContext.actorId!);
      return reply.send({ ok: true, data: results, traceId: req.requestContext.traceId });
    },
  });

  app.patch(`${prefix}/profiles/:id`, {
    schema: {
      tags: ['customer:kundli'],
      summary: 'Update an existing Kundli profile (birth details). Clears cached chart.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(CreateKundliProfileSchema.partial()),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    async handler(req, reply) {
      const { id } = req.params as { id: string };
      const body = req.body as Partial<ReturnType<typeof CreateKundliProfileSchema.parse>>;
      const profile = await service.updateProfile(req.requestContext.actorId!, id, body);
      return reply.send({ ok: true, data: profile, traceId: req.requestContext.traceId });
    },
  });
};
