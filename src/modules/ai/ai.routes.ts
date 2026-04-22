import { JWT_AUDIENCE } from '../../config/constants.js';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { chatWithAiAstrologer } from './ai.service.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const AiChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).min(1),
  birthChartContext: z.record(z.unknown()).optional(),
});

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/customer/ai/chat', {
    schema: {
      tags: ['customer:consultations'],
      summary: 'Chat with AI Astrologer',
      description: 'Always disclosed as AI. Never replaces a human astrologer for deep personal readings.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(AiChatSchema),
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof AiChatSchema>;
      const response = await chatWithAiAstrologer(body.messages, body.birthChartContext);
      return reply.send({ ok: true, data: { response, isAi: true }, traceId: req.requestContext.traceId });
    },
  });
};
