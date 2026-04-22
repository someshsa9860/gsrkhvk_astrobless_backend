// Zod schemas for admin observability endpoints: errors, audit log.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';

// ── System errors ─────────────────────────────────────────────────────────────

export const ErrorListQuerySchema = ListQuerySchema.extend({
  severity: z
    .enum(['debug', 'info', 'warning', 'error', 'critical'])
    .optional()
    .describe('Filter by error severity level'),
  source: z
    .enum(['httpRoute', 'socketHandler', 'bullmqJob', 'scheduledTask', 'webhook'])
    .optional()
    .describe('Filter by where the error originated'),
  isResolved: z.coerce.boolean().optional().describe('Filter by resolved/unresolved state'),
  environment: z
    .enum(['local', 'dev', 'staging', 'prod'])
    .optional()
    .describe('Filter by deployment environment'),
});

export type ErrorListQuery = z.infer<typeof ErrorListQuerySchema>;

// ── Audit log ─────────────────────────────────────────────────────────────────

export const AuditQuerySchema = ListQuerySchema.extend({
  actorId: z.string().uuid().optional().describe('Filter by actorId'),
  actorType: z
    .enum(['customer', 'astrologer', 'admin', 'system', 'provider'])
    .optional()
    .describe('Filter by actor type'),
  action: z.string().optional().describe("Filter by action string, e.g. 'wallet.topup'"),
  targetId: z.string().uuid().optional().describe('Filter by targetId'),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;

// ── Resolve / reopen ──────────────────────────────────────────────────────────

export const ResolveErrorSchema = z.object({
  resolutionNote: z.string().optional().describe('Admin note explaining the resolution'),
});

export type ResolveErrorInput = z.infer<typeof ResolveErrorSchema>;
