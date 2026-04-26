import { readFileSync } from 'node:fs';
import { env } from '../../../config/env.js';
import type { PaymentProvider, CreateOrderInput, CreateOrderResult, ProviderWebhookEvent } from '../payments.types.js';
import { PaymentProviderKey, PaymentProviderCapability } from '../payments.types.js';
import { AppError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';

interface GooglePlayPurchase {
  purchaseState: number; // 0 = purchased
  consumptionState: number;
  orderId: string;
  acknowledgementState: number;
  kind: string;
}

function resolveServiceAccount(): Record<string, unknown> | null {
  const raw = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    if (raw.startsWith('/') || raw.startsWith('./')) {
      return JSON.parse(readFileSync(raw, 'utf8')) as Record<string, unknown>;
    }
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    logger.error({ err }, 'Failed to load Google Play service account');
    return null;
  }
}

async function getAccessToken(): Promise<string> {
  const sa = resolveServiceAccount();
  if (!sa) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Google Play service account not configured.', 500);

  // Use google-auth-library if available, otherwise fall back to manual JWT
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: sa as Parameters<typeof GoogleAuth>[0]['credentials'],
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) throw new Error('No token returned from Google Auth');
    return tokenResponse.token;
  } catch (err) {
    throw new AppError('PAYMENT_PROVIDER_ERROR', `Google Play auth failed: ${(err as Error).message}`, 500);
  }
}

export class GooglePlayProvider implements PaymentProvider {
  readonly key = PaymentProviderKey.GOOGLE_PLAY;
  readonly capabilities = [PaymentProviderCapability.TOPUP];

  // Google Play IAP doesn't use server-side order creation —
  // the client creates the purchase via BillingClient and sends the token for verification.
  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new AppError('PAYMENT_PROVIDER_ERROR', 'Google Play IAP does not support server-side order creation. Use the /topup/iap endpoint.', 400);
  }

  async verifyWebhook(_input: { headers: Record<string, string>; rawBody: Buffer }): Promise<{ isValid: boolean; event: ProviderWebhookEvent }> {
    // Google Play uses RTDN (Real-Time Developer Notifications) via Pub/Sub, not direct webhooks.
    // For MVP, we rely on client-initiated verification. Return not-applicable.
    return { isValid: false, event: { eventType: 'unknown', raw: {} } };
  }

  async fetchOrder(_providerOrderId: string): Promise<ProviderWebhookEvent> {
    return { eventType: 'unknown', raw: {} };
  }

  /**
   * Verify a Google Play purchase token for a one-time product.
   * Returns the orderId which serves as storeTransactionId.
   */
  async verifyPurchase(packageName: string, productId: string, purchaseToken: string): Promise<{ orderId: string; isValid: boolean }> {
    const token = await getAccessToken();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Google Play purchase verification failed');
      throw new AppError('PAYMENT_PROVIDER_ERROR', `Google Play verification failed: ${res.status}`, 400);
    }

    const purchase = await res.json() as GooglePlayPurchase;

    // purchaseState 0 = purchased (valid)
    if (purchase.purchaseState !== 0) {
      return { orderId: purchase.orderId ?? purchaseToken, isValid: false };
    }

    return { orderId: purchase.orderId, isValid: true };
  }

  /**
   * Acknowledge the purchase so Google doesn't auto-refund after 3 days.
   * Must be called after crediting the wallet.
   */
  async acknowledgePurchase(packageName: string, productId: string, purchaseToken: string): Promise<void> {
    const token = await getAccessToken();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}:acknowledge`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok && res.status !== 204) {
      logger.warn({ status: res.status, productId, purchaseToken }, 'Google Play acknowledge failed — will retry');
    }
  }
}
