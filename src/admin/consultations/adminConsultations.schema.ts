// Zod schemas for admin consultation management endpoints.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';

// ── List consultations ────────────────────────────────────────────────────────

export const ConsultationListQuerySchema = ListQuerySchema.extend({
  status: z
    .enum(['requested', 'accepted', 'active', 'ended', 'rejected', 'cancelled'])
    .optional()
    .describe('Filter by consultation status'),
  type: z.enum(['chat', 'voice', 'video']).optional().describe('Filter by consultation type'),
  customerId: z.string().uuid().optional().describe('Filter to a specific customer'),
  astrologerId: z.string().uuid().optional().describe('Filter to a specific astrologer'),
});

export type ConsultationListQuery = z.infer<typeof ConsultationListQuerySchema>;

// ── Force end ─────────────────────────────────────────────────────────────────

export const ForceEndSchema = z.object({
  reason: z.string().min(3).describe('Admin-provided reason for force-ending the consultation'),
});

export type ForceEndInput = z.infer<typeof ForceEndSchema>;
