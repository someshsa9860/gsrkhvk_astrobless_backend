import { z } from 'zod';
import { PaymentProviderKey } from '../payments/payments.types.js';

export const TopupSchema = z.object({
  amountPaise: z.number().int().min(10000).describe('Minimum ₹100 top-up (10000 paise)'),
  providerKey: z.nativeEnum(PaymentProviderKey),
  idempotencyKey: z.string().uuid().describe('Client-generated UUID for idempotency'),
});

export const WalletTransactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
