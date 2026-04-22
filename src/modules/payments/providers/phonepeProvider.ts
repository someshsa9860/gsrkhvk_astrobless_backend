import crypto from 'crypto';
import axios from 'axios';
import { env } from '../../../config/env.js';

import type { PaymentProvider, CreateOrderInput, CreateOrderResult, ProviderWebhookEvent } from '../payments.types.js';
import { PaymentProviderKey, PaymentProviderCapability } from '../payments.types.js';
import { AppError } from '../../../lib/errors.js';

export class PhonePeProvider implements PaymentProvider {
  readonly key = PaymentProviderKey.PHONEPE;
  readonly capabilities = [PaymentProviderCapability.TOPUP];

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const payload = {
      merchantId: env.PHONEPE_MERCHANT_ID,
      merchantTransactionId: input.idempotencyKey.slice(0, 38),
      amount: input.amountPaise,
      redirectUrl: `${env.APP_BASE_URL}/payment/callback`,
      redirectMode: 'POST',
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const checksum = crypto
      .createHash('sha256')
      .update(`${base64Payload}/pg/v1/pay${env.PHONEPE_SALT_KEY}`)
      .digest('hex') + `###${env.PHONEPE_SALT_INDEX}`;

    try {
      const res = await axios.post(
        `${env.PHONEPE_BASE_URL}/pg/v1/pay`,
        { request: base64Payload },
        { headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum } },
      );

      const data = res.data as { data?: { instrumentResponse?: { redirectInfo?: { url?: string } }; merchantTransactionId?: string } };
      return {
        providerOrderId: data.data?.merchantTransactionId ?? input.idempotencyKey,
        providerKey: this.key,
        clientPayload: { redirectUrl: data.data?.instrumentResponse?.redirectInfo?.url },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    } catch {
      throw new AppError('PAYMENT_PROVIDER_ERROR', 'Failed to create PhonePe order.', 502);
    }
  }

  async verifyWebhook(input: { headers: Record<string, string>; rawBody: Buffer }): Promise<{ isValid: boolean; event: ProviderWebhookEvent }> {
    const xVerify = input.headers['x-verify'];
    if (!xVerify) return { isValid: false, event: { eventType: 'unknown', raw: null } };

    const [receivedHash] = xVerify.split('###');
    const body = JSON.parse(input.rawBody.toString()) as { response?: string };
    const decoded = Buffer.from(body.response ?? '', 'base64').toString();
    const expected = crypto.createHash('sha256').update(`${body.response}${env.PHONEPE_SALT_KEY}`).digest('hex');

    if (receivedHash !== expected) return { isValid: false, event: { eventType: 'unknown', raw: null } };

    const data = JSON.parse(decoded) as { data?: { state?: string; transactionId?: string; merchantTransactionId?: string; amount?: number } };
    const state = data.data?.state;

    return {
      isValid: true,
      event: {
        eventType: state === 'COMPLETED' ? 'paymentSucceeded' : state === 'FAILED' ? 'paymentFailed' : 'unknown',
        providerPaymentId: data.data?.transactionId,
        providerOrderId: data.data?.merchantTransactionId,
        amountPaise: data.data?.amount,
        raw: data,
      },
    };
  }

  async fetchOrder(providerOrderId: string): Promise<ProviderWebhookEvent> {
    const checksum = crypto
      .createHash('sha256')
      .update(`/pg/v1/status/${env.PHONEPE_MERCHANT_ID}/${providerOrderId}${env.PHONEPE_SALT_KEY}`)
      .digest('hex') + `###${env.PHONEPE_SALT_INDEX}`;

    try {
      const res = await axios.get(
        `${env.PHONEPE_BASE_URL}/pg/v1/status/${env.PHONEPE_MERCHANT_ID}/${providerOrderId}`,
        { headers: { 'X-VERIFY': checksum, 'X-MERCHANT-ID': env.PHONEPE_MERCHANT_ID } },
      );
      const data = res.data as { data?: { state?: string; transactionId?: string; amount?: number } };
      return {
        eventType: data.data?.state === 'COMPLETED' ? 'paymentSucceeded' : 'paymentFailed',
        providerPaymentId: data.data?.transactionId,
        amountPaise: data.data?.amount,
        raw: data,
      };
    } catch {
      throw new AppError('PAYMENT_PROVIDER_ERROR', 'Failed to fetch PhonePe order.', 502);
    }
  }
}
