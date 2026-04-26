import { env } from '../../../config/env.js';
import type { PaymentProvider, CreateOrderInput, CreateOrderResult, ProviderWebhookEvent } from '../payments.types.js';
import { PaymentProviderKey, PaymentProviderCapability } from '../payments.types.js';
import { AppError } from '../../../lib/errors.js';
import { logger } from '../../../lib/logger.js';

const PROD_VERIFY_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX_VERIFY_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleVerifyResponse {
  status: number;
  receipt?: {
    in_app?: AppleInAppItem[];
  };
  latest_receipt_info?: AppleInAppItem[];
}

interface AppleInAppItem {
  transaction_id: string;
  original_transaction_id: string;
  product_id: string;
  purchase_date_ms: string;
  quantity: string;
  cancellation_date_ms?: string;
}

export class AppleIapProvider implements PaymentProvider {
  readonly key = PaymentProviderKey.APPLE_IAP;
  readonly capabilities = [PaymentProviderCapability.TOPUP];

  // Apple IAP doesn't use server-side order creation —
  // the client completes the purchase via StoreKit and sends the transactionId for verification.
  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new AppError('PAYMENT_PROVIDER_ERROR', 'Apple IAP does not support server-side order creation. Use the /topup/iap endpoint.', 400);
  }

  async verifyWebhook(_input: { headers: Record<string, string>; rawBody: Buffer }): Promise<{ isValid: boolean; event: ProviderWebhookEvent }> {
    // Apple uses App Store Server Notifications (ASSN). For MVP, client-initiated verification is used.
    return { isValid: false, event: { eventType: 'unknown', raw: {} } };
  }

  async fetchOrder(_providerOrderId: string): Promise<ProviderWebhookEvent> {
    return { eventType: 'unknown', raw: {} };
  }

  /**
   * Verify an Apple IAP receipt/transactionId using the App Store receipt verification API.
   * Apple recommends verifying the receipt (base64-encoded) returned by StoreKit 1,
   * or the signedTransaction JWT from StoreKit 2 (decoded server-side).
   *
   * For MVP we use the legacy receipt verification endpoint which works with both StoreKit versions.
   * The `receiptData` is the base64-encoded receipt from StoreKit.
   */
  async verifyReceipt(receiptData: string, transactionId: string): Promise<{ storeTransactionId: string; isValid: boolean; productId: string }> {
    const sharedSecret = env.APPLE_IAP_SHARED_SECRET;
    const verifyUrl = env.APPLE_IAP_VERIFY_URL || PROD_VERIFY_URL;

    const payload = { 'receipt-data': receiptData, password: sharedSecret, 'exclude-old-transactions': true };

    let res = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = await res.json() as AppleVerifyResponse;

    // status 21007 = receipt is from sandbox; retry against sandbox URL
    if (data.status === 21007) {
      res = await fetch(SANDBOX_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json() as AppleVerifyResponse;
    }

    if (data.status !== 0) {
      logger.error({ status: data.status, transactionId }, 'Apple IAP receipt verification failed');
      throw new AppError('PAYMENT_PROVIDER_ERROR', `Apple IAP verification failed with status ${data.status}`, 400);
    }

    // Find the specific transaction in the receipt
    const allTransactions = [
      ...(data.receipt?.in_app ?? []),
      ...(data.latest_receipt_info ?? []),
    ];

    const txn = allTransactions.find(
      (t) => t.transaction_id === transactionId || t.original_transaction_id === transactionId,
    );

    if (!txn) {
      logger.warn({ transactionId, allTransactions: allTransactions.map((t) => t.transaction_id) }, 'Transaction not found in Apple receipt');
      return { storeTransactionId: transactionId, isValid: false, productId: '' };
    }

    // Cancelled/refunded transactions have cancellation_date_ms
    if (txn.cancellation_date_ms) {
      return { storeTransactionId: txn.transaction_id, isValid: false, productId: txn.product_id };
    }

    return { storeTransactionId: txn.transaction_id, isValid: true, productId: txn.product_id };
  }
}
