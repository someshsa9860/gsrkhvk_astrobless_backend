// Zod schemas for admin astrologer management endpoints.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';

// ── List astrologers ──────────────────────────────────────────────────────────

export const AstrologerListQuerySchema = ListQuerySchema.extend({
  kycStatus: z.enum(['pending', 'approved', 'rejected']).optional().describe('Filter by KYC status'),
  isOnline: z.coerce.boolean().optional().describe('Filter by current online presence'),
  isBlocked: z.coerce.boolean().optional().describe('Filter by blocked status'),
});

export type AstrologerListQuery = z.infer<typeof AstrologerListQuerySchema>;

// ── KYC decision ──────────────────────────────────────────────────────────────

export const KycDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']).describe('Outcome of the KYC review'),
  note: z.string().optional().describe('Optional note visible to the astrologer'),
});

export type KycDecisionInput = z.infer<typeof KycDecisionSchema>;

// ── Block / Unblock ───────────────────────────────────────────────────────────

export const BlockAstrologerSchema = z.object({
  reason: z.string().min(3).describe('Reason for blocking (audited)'),
});

export type BlockAstrologerInput = z.infer<typeof BlockAstrologerSchema>;

// ── Commission override ───────────────────────────────────────────────────────

export const CommissionOverrideSchema = z.object({
  commissionPct: z.number().min(0).max(100).describe('New platform commission percentage (0–100)'),
  reason: z.string().min(3).describe('Why the commission is being overridden (audited)'),
});

export type CommissionOverrideInput = z.infer<typeof CommissionOverrideSchema>;
