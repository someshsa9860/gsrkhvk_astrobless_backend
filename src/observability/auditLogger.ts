import { prisma, type PrismaTransaction } from '../db/client.js';
import { getContext } from '../lib/context.js';
import { logger } from '../lib/logger.js';

export interface AuditLogInput {
  actorType: 'customer' | 'astrologer' | 'admin' | 'system' | 'provider';
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput, tx?: PrismaTransaction): Promise<void> {
  const ctx = getContext();
  const client = tx ?? prisma;

  try {
    await client.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? ctx.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary,
        beforeState: input.beforeState ?? undefined,
        afterState: input.afterState ?? undefined,
        metadata: input.metadata ?? undefined,
        traceId: ctx.traceId,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}
