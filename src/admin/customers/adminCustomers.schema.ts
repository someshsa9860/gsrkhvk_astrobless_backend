// Zod schemas for admin customer endpoints; used for runtime validation + OpenAPI generation.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';

// ── List customers ────────────────────────────────────────────────────────────

export const CustomerListQuerySchema = ListQuerySchema.extend({
  isBlocked: z.coerce.boolean().optional().describe('Filter by blocked status'),
  signupSince: z.string().datetime().optional().describe('Only customers created after this ISO 8601 timestamp'),
  minSpend: z.coerce.number().int().min(0).optional().describe('Minimum lifetime spend in paise'),
});

export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;

// ── Block customer ────────────────────────────────────────────────────────────

export const BlockCustomerSchema = z.object({
  reason: z.string().min(3).describe('Human-readable reason for the block (audited)'),
});

export type BlockCustomerInput = z.infer<typeof BlockCustomerSchema>;

// ── Wallet credit ─────────────────────────────────────────────────────────────

export const WalletAdjustSchema = z.object({
  amountPaise: z.number().int().positive().describe('Amount to credit in paise — must be positive integer'),
  reason: z.string().min(3).describe('Mandatory reason for audit trail'),
  type: z.enum(['GOODWILL', 'COMPENSATION', 'BONUS', 'ADMIN_ADJUST']).describe('Transaction sub-type'),
});

export type WalletAdjustInput = z.infer<typeof WalletAdjustSchema>;
