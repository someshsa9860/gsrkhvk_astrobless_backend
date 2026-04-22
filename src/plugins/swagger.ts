import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';

const swaggerPlugin: FastifyPluginAsync = async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: `${env.APP_NAME} API`,
        description: 'Astrology consultation marketplace — Customer, Astrologer & Admin APIs',
        version: env.APP_VERSION,
      },
      servers: [{ url: '/v1', description: 'API v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      tags: [
        { name: 'customer:auth', description: 'Customer authentication' },
        { name: 'customer:profile', description: 'Customer profile' },
        { name: 'customer:wallet', description: 'Wallet & payments' },
        { name: 'customer:consultations', description: 'Consultation booking & history' },
        { name: 'customer:astrologers', description: 'Browse & search astrologers' },
        { name: 'customer:content', description: 'Horoscopes & birth charts' },
        { name: 'astrologer:auth', description: 'Astrologer authentication' },
        { name: 'astrologer:profile', description: 'Astrologer profile management' },
        { name: 'astrologer:consultations', description: 'Consultation management' },
        { name: 'astrologer:earnings', description: 'Earnings & payout history' },
        { name: 'admin:auth', description: 'Admin authentication' },
        { name: 'admin:customers', description: 'Customer management' },
        { name: 'admin:astrologers', description: 'Astrologer management & KYC' },
        { name: 'admin:consultations', description: 'Consultation oversight' },
        { name: 'admin:payouts', description: 'Payout approvals' },
        { name: 'admin:observability', description: 'Logs, errors & traces' },
        { name: 'public:horoscope', description: 'Public horoscope feed' },
        { name: 'webhooks:payments', description: 'Payment provider webhooks' },
        { name: 'webhooks:agora', description: 'Agora webhooks' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    staticCSP: true,
  });
};

export default fp(swaggerPlugin, { name: 'swagger' });
