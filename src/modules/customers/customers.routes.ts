import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './customers.controller.js';
import { UpdateProfileSchema } from './customers.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const customerRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/customer';

  app.get(`${prefix}/me`, {
    schema: {
      tags: ['customer:profile'],
      summary: 'Get current customer profile',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.getProfile,
  });

  app.patch(`${prefix}/me`, {
    schema: {
      tags: ['customer:profile'],
      summary: 'Update customer profile',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateProfileSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.updateProfile,
  });
};
