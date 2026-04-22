import { db, type DbTransaction } from '../db/client.js';
import { auditLog } from '../db/schema/observability.js';
import { getContext } from '../lib/context.js';
import { logger } from '../lib/logger.js';

export interface AuditLogInput {
  actorType: 'customer' | 'astrologer' | 'admin' | 'system' | 'provider';
  actorId?: string;
  action: string; // resource.verb — e.g. wallet.topup
  targetType?: string;
  targetId?: string;
  summary: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput, tx?: DbTransaction): Promise<void> {
  const ctx = getContext();
  const record = {
    actorType: input.actorType,
    actorId: input.actorId ?? ctx.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
    metadata: input.metadata ?? null,
    traceId: ctx.traceId,
  };

  try {
    const client = tx ?? db;
    await client.insert(auditLog).values(record);
  } catch (err) {
    // Audit log failure must never crash the request — log and continue
    logger.error({ err, record }, 'Failed to write audit log');
  }
}
