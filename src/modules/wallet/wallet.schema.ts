import { z } from 'zod';
import { PaymentProviderKey } from '../payments/payments.types.js';

export const TopupSchema = z.object({
  amount: z.number().min(1).describe('Top-up amount in ₹'),
  providerKey: z.nativeEnum(PaymentProviderKey),
  idempotencyKey: z.string().uuid().describe('Client-generated UUID for idempotency'),
});

export const IapTopupSchema = z.object({
  platform: z.enum(['android', 'ios']).describe('Mobile platform initiating the IAP'),
  productId: z.string().min(1).describe('Product ID from Google Play Console or App Store Connect'),
  amount: z.number().int().min(1).describe('Expected wallet credit amount in paise (1/100 of ₹1). Server validates this matches the product.'),
  idempotencyKey: z.string().uuid().describe('Client-generated UUID for idempotency'),
  token: z.string().min(1).describe('Google Play: purchaseToken from BillingClient. Apple: base64-encoded receipt from StoreKit.'),
  transactionId: z.string().min(1).describe('Google Play: orderId from BillingClient. Apple: transactionId from StoreKit.'),
  packageName: z.string().optional().describe('Android only: override the package name (defaults to server GOOGLE_PLAY_PACKAGE_NAME env var)'),
});

export const WalletTransactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
