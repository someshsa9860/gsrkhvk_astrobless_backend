// Zod schemas for admin finance endpoints: transactions, payouts.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';

// ── Transactions ──────────────────────────────────────────────────────────────

export const TransactionListQuerySchema = ListQuerySchema.extend({
  type: z
    .enum(['TOPUP', 'CONSULTATION_DEBIT', 'REFUND', 'BONUS', 'ADMIN_ADJUST'])
    .optional()
    .describe('Filter by transaction type'),
  direction: z.enum(['CREDIT', 'DEBIT']).optional().describe('Filter by credit/debit direction'),
  customerId: z.string().uuid().optional().describe('Filter to a specific customer'),
});

export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>;

// ── Payouts ───────────────────────────────────────────────────────────────────

export const PayoutListQuerySchema = ListQuerySchema.extend({
  status: z
    .enum(['queued', 'processing', 'processed', 'failed'])
    .optional()
    .describe('Filter by payout status'),
  astrologerId: z.string().uuid().optional().describe('Filter to a specific astrologer'),
});

export type PayoutListQuery = z.infer<typeof PayoutListQuerySchema>;

// ── Payout approval ───────────────────────────────────────────────────────────

export const ApprovePayoutSchema = z.object({
  reason: z.string().optional().describe('Optional note for the audit trail'),
});

export type ApprovePayoutInput = z.infer<typeof ApprovePayoutSchema>;
