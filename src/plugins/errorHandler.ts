import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
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
