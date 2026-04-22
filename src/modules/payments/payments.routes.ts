import type { FastifyPluginAsync } from 'fastify';
import { providerRegistry } from './providers/providerRegistry.js';
import { applyTopupCredit } from '../wallet/wallet.service.js';
import { reportError } from '../../observability/errorReporter.js';
import { logger } from '../../lib/logger.js';
import type { PaymentProviderKey } from './payments.types.js';

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/webhooks/payments/:providerKey', {
    config: { rawBody: true },
    schema: {
      tags: ['webhooks:payments'],
      summary: 'Receive payment provider webhooks',
      description: 'Signature-verified webhook endpoint for all payment providers.',
    },
    handler: async (req, reply) => {
      const { providerKey } = req.params as { providerKey: string };
      const rawBody = (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));

      let provider: ReturnType<typeof providerRegistry.get>;
      try {
        provider = providerRegistry.get(providerKey as PaymentProviderKey);
      } catch {
        return reply.status(400).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Unknown provider' } });
      }

      const { isValid, event } = await provider.verifyWebhook({
        headers: req.headers as Record<string, string>,
        rawBody,
      });

      if (!isValid) {
        logger.warn({ providerKey }, 'Invalid webhook signature');
        return reply.status(401).send({ ok: false });
      }

      if (event.eventType === 'paymentSucceeded' && event.providerOrderId && event.providerPaymentId && event.amountPaise) {
        try {
          await applyTopupCredit(providerKey as PaymentProviderKey, event.providerOrderId, event.providerPaymentId, event.amountPaise);
        } catch (err) {
          await reportError({ error: err as Error, source: 'webhook', sourceDetail: `payments.${providerKey}`, metadata: { event } });
        }
      }

      return reply.send({ ok: true });
    },
  });
};
