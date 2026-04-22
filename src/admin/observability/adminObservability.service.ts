// Admin observability service: system errors CRUD + audit log viewer.
// Every read of sensitive data is itself audited to maintain the audit chain.

import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { systemErrors, auditLog } from '../../db/schema/observability.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { ErrorListQuery, AuditQuery, ResolveErrorInput } from './adminObservability.schema.js';

// ── System errors ─────────────────────────────────────────────────────────────

// Returns paginated system errors; audits the view to track who is looking at errors.
export async function listErrors(adminId: string, q: ErrorListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.severity) conditions.push(eq(systemErrors.severity, q.severity));
  if (q.source) conditions.push(eq(systemErrors.source, q.source));
  if (q.isResolved !== undefined) conditions.push(eq(systemErrors.isResolved, q.isResolved));
  if (q.environment) conditions.push(eq(systemErrors.environment, q.environment));
  if (q.from) conditions.push(gte(systemErrors.createdAt, new Date(q.from)));

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.systemErrors.findMany({ where, limit, offset, orderBy: [desc(systemErrors.lastSeenAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(systemErrors).where(where),
  ]);

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'admin.errorView',
    summary: 'Admin viewed system errors list',
    metadata: { filters: q },
  });

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// Returns single error detail; audits the access so we know who looked at which error.
export async function getError(adminId: string, errorId: string) {
  const error = await db.query.systemErrors.findFirst({ where: eq(systemErrors.id, errorId) });
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

// Marks an error resolved and records the resolution note.
export async function resolveError(adminId: string, errorId: string, input: ResolveErrorInput) {
  const error = await db.query.systemErrors.findFirst({ where: eq(systemErrors.id, errorId) });
  if (!error) throw new AppError('NOT_FOUND', 'Error not found.', 404);

  await db.update(systemErrors).set({
    isResolved: true,
    resolvedBy: adminId,
    resolvedAt: new Date(),
    resolutionNote: input.resolutionNote ?? null,
  }).where(eq(systemErrors.id, errorId));

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

// Reopens a previously resolved error — useful when the fix didn't hold.
export async function reopenError(adminId: string, errorId: string) {
  const error = await db.query.systemErrors.findFirst({ where: eq(systemErrors.id, errorId) });
  if (!error) throw new AppError('NOT_FOUND', 'Error not found.', 404);

  await db.update(systemErrors).set({
    isResolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
  }).where(eq(systemErrors.id, errorId));

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

// Aggregates counts by severity and by source — used for dashboard widgets.
export async function getErrorStats() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [bySeverity, bySource, recentCount] = await Promise.all([
    db
      .select({ severity: systemErrors.severity, count: sql<number>`count(*)` })
      .from(systemErrors)
      .where(eq(systemErrors.isResolved, false))
      .groupBy(systemErrors.severity),
    db
      .select({ source: systemErrors.source, count: sql<number>`count(*)` })
      .from(systemErrors)
      .where(eq(systemErrors.isResolved, false))
      .groupBy(systemErrors.source),
    db
      .select({ count: sql<number>`count(*)` })
      .from(systemErrors)
      .where(gte(systemErrors.createdAt, last24h)),
  ]);

  return {
    bySeverity: bySeverity.map((r) => ({ severity: r.severity, count: Number(r.count) })),
    bySource: bySource.map((r) => ({ source: r.source, count: Number(r.count) })),
    last24hTotal: Number(recentCount[0]?.count ?? 0),
  };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

// Returns paginated audit log entries; viewing the audit log is itself audited.
export async function listAuditLog(adminId: string, q: AuditQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.actorId) conditions.push(eq(auditLog.actorId, q.actorId));
  if (q.actorType) conditions.push(eq(auditLog.actorType, q.actorType));
  if (q.action) conditions.push(eq(auditLog.action, q.action));
  if (q.targetId) conditions.push(eq(auditLog.targetId, q.targetId));
  if (q.from) conditions.push(gte(auditLog.createdAt, new Date(q.from)));

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.auditLog.findMany({ where, limit, offset, orderBy: [desc(auditLog.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(auditLog).where(where),
  ]);

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'audit.logView',
    summary: 'Admin viewed audit log',
    metadata: { filters: q },
  });

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}
