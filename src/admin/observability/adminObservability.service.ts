// Admin observability service: system errors CRUD + audit log viewer.
// Every read of sensitive data is itself audited to maintain the audit chain.

import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { ErrorListQuery, AuditQuery, ResolveErrorInput } from './adminObservability.schema.js';

// ── System errors ─────────────────────────────────────────────────────────────

export async function listErrors(adminId: string, q: ErrorListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.severity) where['severity'] = q.severity;
  if (q.source) where['source'] = q.source;
  if (q.isResolved !== undefined) where['isResolved'] = q.isResolved;
  if (q.environment) where['environment'] = q.environment;
  if (q.from) where['createdAt'] = { gte: new Date(q.from) };

  const [items, total] = await prisma.$transaction([
    prisma.systemError.findMany({ where, skip: offset, take: limit, orderBy: { lastSeenAt: 'desc' } }),
    prisma.systemError.count({ where }),
  ]);

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'admin.errorView',
    summary: 'Admin viewed system errors list',
    metadata: { filters: q },
  });

  return toPagedResult(items, total, q);
}

export async function getError(adminId: string, errorId: string) {
  const error = await prisma.systemError.findFirst({ where: { id: errorId } });
  if (!error) throw new AppError('NOT_FOUND', 'Error not found.', 404);

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'admin.errorView',
    targetType: 'systemError',
    targetId: errorId,
    summary: `Admin viewed error detail: ${error.errorName}`,
  });

  return error;
}

export async function resolveError(adminId: string, errorId: string, input: ResolveErrorInput) {
  const error = await prisma.systemError.findFirst({ where: { id: errorId } });
  if (!error) throw new AppError('NOT_FOUND', 'Error not found.', 404);

  await prisma.systemError.update({
    where: { id: errorId },
    data: {
      isResolved: true,
      resolvedBy: adminId,
      resolvedAt: new Date(),
      resolutionNote: input.resolutionNote ?? null,
    },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'admin.errorResolve',
    targetType: 'systemError',
    targetId: errorId,
    summary: `Error resolved. Note: ${input.resolutionNote ?? 'none'}`,
    beforeState: { isResolved: false },
    afterState: { isResolved: true, resolutionNote: input.resolutionNote },
  });
}

export async function reopenError(adminId: string, errorId: string) {
  const error = await prisma.systemError.findFirst({ where: { id: errorId } });
  if (!error) throw new AppError('NOT_FOUND', 'Error not found.', 404);

  await prisma.systemError.update({
    where: { id: errorId },
    data: {
      isResolved: false,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
    },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'admin.errorReopen',
    targetType: 'systemError',
    targetId: errorId,
    summary: 'Error reopened.',
    beforeState: { isResolved: true },
    afterState: { isResolved: false },
  });
}

// ── Error stats ───────────────────────────────────────────────────────────────

export async function getErrorStats() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [bySeverity, bySource, recentCount] = await Promise.all([
    prisma.systemError.groupBy({
      by: ['severity'],
      where: { isResolved: false },
      _count: { id: true },
    }),
    prisma.systemError.groupBy({
      by: ['source'],
      where: { isResolved: false },
      _count: { id: true },
    }),
    prisma.systemError.count({ where: { createdAt: { gte: last24h } } }),
  ]);

  return {
    bySeverity: bySeverity.map((r) => ({ severity: r.severity, count: r._count.id })),
    bySource: bySource.map((r) => ({ source: r.source, count: r._count.id })),
    last24hTotal: recentCount,
  };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function listAuditLog(adminId: string, q: AuditQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.actorId) where['actorId'] = q.actorId;
  if (q.actorType) where['actorType'] = q.actorType;
  if (q.action) where['action'] = q.action;
  if (q.targetId) where['targetId'] = q.targetId;
  if (q.from) where['createdAt'] = { gte: new Date(q.from) };

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ]);

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'audit.logView',
    summary: 'Admin viewed audit log',
    metadata: { filters: q },
  });

  return toPagedResult(items, total, q);
}
