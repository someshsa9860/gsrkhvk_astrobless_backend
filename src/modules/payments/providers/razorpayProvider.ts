import crypto from 'crypto';
import axios from 'axios';
import { env } from '../../../config/env.js';
import type { PaymentProvider, CreateOrderInput, CreateOrderResult, ProviderWebhookEvent, PayoutInput, PayoutResult } from '../payments.types.js';
import { PaymentProviderKey, PaymentProviderCapability } from '../payments.types.js';
import { AppError } from '../../../lib/errors.js';

export class RazorpayProvider implements PaymentProvider {
  readonly key = PaymentProviderKey.RAZORPAY;
  readonly capabilities = [PaymentProviderCapability.TOPUP, PaymentProviderCapability.PAYOUT, PaymentProviderCapability.REFUND];

  private readonly authHeader: string;

  constructor() {
    const creds = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    this.authHeader = `Basic ${creds}`;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    try {
      const res = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: input.amount,
          currency: input.currency,
          receipt: input.idempotencyKey.slice(0, 40),
          notes: { customerId: input.customerId, idempotencyKey: input.idempotencyKey },
        },
        { headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' } },
      );

      return {
        providerOrderId: res.data.id as string,
        providerKey: this.key,
        clientPayload: { orderId: res.data.id, keyId: env.RAZORPAY_KEY_ID, amount: input.amount, currency: input.currency },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    } catch (err) {
      throw new AppError('PAYMENT_PROVIDER_ERROR', 'Failed to create Razorpay order.', 502, { provider: 'razorpay' });
    }
  }

  async verifyWebhook(input: { headers: Record<string, string>; rawBody: Buffer }): Promise<{ isValid: boolean; event: ProviderWebhookEvent }> {
    const signature = input.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(input.rawBody).digest('hex');

    if (signature !== expected) return { isValid: false, event: { eventType: 'unknown', raw: null } };

    const payload = JSON.parse(input.rawBody.toString()) as Record<string, unknown>;
    const event = parseRazorpayEvent(payload);
    return { isValid: true, event };
  }

  async fetchOrder(providerOrderId: string): Promise<ProviderWebhookEvent> {
    try {
      const res = await axios.get(`https://api.razorpay.com/v1/orders/${providerOrderId}/payments`, {
        headers: { Authorization: this.authHeader },
      });
      const payment = (res.data as { items?: unknown[] }).items?.[0] as Record<string, unknown> | undefined;
      if (!payment) return { eventType: 'unknown', raw: res.data };
      return {
        eventType: payment['status'] === 'captured' ? 'paymentSucceeded' : 'paymentFailed',
        providerOrderId,
        providerPaymentId: payment['id'] as string,
        amount: payment['amount'] as number,
        raw: payment,
      };
    } catch {
      throw new AppError('PAYMENT_PROVIDER_ERROR', 'Failed to fetch Razorpay order.', 502);
    }
  }

  async refund(providerPaymentId: string, amount: number, idempotencyKey: string): Promise<ProviderWebhookEvent> {
    try {
      const res = await axios.post(
        `https://api.razorpay.com/v1/payments/${providerPaymentId}/refund`,
        { amount: amount, notes: { idempotencyKey } },
        { headers: { Authorization: this.authHeader } },
      );
      return { eventType: 'refundProcessed', providerPaymentId, amount, raw: res.data };
    } catch {
      throw new AppError('PAYMENT_PROVIDER_ERROR', 'Razorpay refund failed.', 502);
    }
  }
}

function parseRazorpayEvent(payload: Record<string, unknown>): ProviderWebhookEvent {
  const event = payload['event'] as string;
  const entity = (payload['payload'] as Record<string, unknown>)?.['payment']?.['entity'] as Record<string, unknown> | undefined;
  if (!entity) return { eventType: 'unknown', raw: payload };

  const map: Record<string, ProviderWebhookEvent['eventType']> = {
    'payment.captured': 'paymentSucceeded',
    'payment.failed': 'paymentFailed',
    'refund.processed': 'refundProcessed',
  };

  return {
    eventType: map[event] ?? 'unknown',
    providerOrderId: entity['order_id'] as string | undefined,
    providerPaymentId: entity['id'] as string | undefined,
    amount: entity['amount'] as number | undefined,
    raw: payload,
  };
}
