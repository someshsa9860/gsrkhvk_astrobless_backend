import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { requestContextStorage, type RequestContext } from '../lib/context.js';

const requestContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', (req, _reply, done) => {
    const traceId = (req.headers['x-trace-id'] as string) ?? uuidv4();
    const ctx: RequestContext = {
      traceId,
      requestId: req.id as string,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      appVersion: req.headers['x-app-version'] as string | undefined,
      platform: req.headers['x-platform'] as string | undefined,
    };

    req.requestContext = ctx;

    requestContextStorage.run(ctx, () => done());
  });
};

export default fp(requestContextPlugin, { name: 'requestContext' });
