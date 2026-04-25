import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { AppError, isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, req, reply) => {
    const ctx = req.requestContext;
    const traceId = ctx?.traceId ?? 'unknown';

    if (isAppError(error)) {
      if (error.statusCode >= 500) {
        logger.error({ traceId, err: error }, 'AppError 5xx');
      }
      return reply.status(error.statusCode).send({
        ok: false,
        error: { code: error.code, message: error.message, details: error.details },
        traceId,
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'VALIDATION', message: 'Request validation failed', details: { errors: error.validation } },
        traceId,
      });
    }

    // Prisma unique constraint violation → 409
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const fields = (error.meta?.['target'] as string[] | undefined) ??
        ((error.meta?.['driverAdapterError'] as { cause?: { constraint?: { fields?: string[] } } } | undefined)
          ?.cause?.constraint?.fields ?? []);
      const fieldList = fields.join(', ');
      return reply.status(409).send({
        ok: false,
        error: { code: 'CONFLICT', message: `A record with this ${fieldList || 'value'} already exists.` },
        traceId,
      });
    }

    // Rate limit errors from @fastify/rate-limit
    if (error.statusCode === 429) {
      return reply.status(429).send({
        ok: false,
        error: { code: 'RATE_LIMIT', message: error.message },
        traceId,
      });
    }

    logger.error({ traceId, err: error }, 'Unhandled error');

    return reply.status(500).send({
      ok: false,
      error: { code: 'INTERNAL', message: 'An unexpected error occurred' },
      traceId,
    });
  });

  app.setNotFoundHandler((req, reply) => {
    const traceId = req.requestContext?.traceId ?? 'unknown';
    return reply.status(404).send({
      ok: false,
      error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` },
      traceId,
    });
  });
};

export default fp(errorHandlerPlugin, { name: 'errorHandler' });
