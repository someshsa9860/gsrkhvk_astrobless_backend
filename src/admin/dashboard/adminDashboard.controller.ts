// Dashboard controller — delegates to service, wraps in standard envelope.

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminDashboard.service.js';

export async function getOverview(req: FastifyRequest, reply: FastifyReply) {
  const data = await service.getOverview();
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}

export async function getGeoDistribution(req: FastifyRequest, reply: FastifyReply) {
  const data = await service.getGeoDistribution();
  return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
}
