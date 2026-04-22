// Business logic for admin-facing astrologer management.

import { eq, ilike, desc, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { astrologers } from '../../db/schema/astrologers.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type {
  AstrologerListQuery,
  KycDecisionInput,
  BlockAstrologerInput,
  CommissionOverrideInput,
} from './adminAstrologers.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

// Runs list + count in parallel; kycStatus/isOnline/isBlocked all composable.
export async function listAstrologers(q: AstrologerListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.search) conditions.push(ilike(astrologers.displayName, `%${q.search}%`));
  if (q.kycStatus) conditions.push(eq(astrologers.kycStatus, q.kycStatus));
  if (q.isOnline !== undefined) conditions.push(eq(astrologers.isOnline, q.isOnline));
  if (q.isBlocked !== undefined) conditions.push(eq(astrologers.isBlocked, q.isBlocked));

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.astrologers.findMany({ where, limit, offset, orderBy: [desc(astrologers.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(astrologers).where(where),
  ]);

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

// Returns full profile — kycDocsRef and bankAccountRef are returned as-is;
// callers must sign S3 URLs before sending to admin UI.
export async function getAstrologer(id: string) {
  const astrologer = await db.query.astrologers.findFirst({ where: eq(astrologers.id, id) });
  if (!astrologer) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);
  return astrologer;
}

// ── KYC decision ──────────────────────────────────────────────────────────────

// Approving KYC also flips isVerified so the astrologer appears in search.
export async function decideKyc(adminId: string, astrologerId: string, input: KycDecisionInput) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  const isApproved = input.decision === 'approved';
  await db
    .update(astrologers)
    .set({ kycStatus: input.decision, isVerified: isApproved, updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: isApproved ? 'astrologer.kycApprove' : 'astrologer.kycReject',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `KYC ${input.decision}. Note: ${input.note ?? 'none'}`,
    beforeState: { kycStatus: before.kycStatus, isVerified: before.isVerified },
    afterState: { kycStatus: input.decision, isVerified: isApproved },
    metadata: { note: input.note },
  });
}

// ── Block / Unblock ───────────────────────────────────────────────────────────

// Blocking an astrologer prevents them from going online or accepting consultations.
export async function blockAstrologer(adminId: string, astrologerId: string, input: BlockAstrologerInput) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await db
    .update(astrologers)
    .set({ isBlocked: true, blockedReason: input.reason, isOnline: false, updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.block',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Astrologer blocked. Reason: ${input.reason}`,
    beforeState: { isBlocked: before.isBlocked, isOnline: before.isOnline },
    afterState: { isBlocked: true, isOnline: false, blockedReason: input.reason },
  });
}

// Unblocking restores availability but does NOT auto-set isOnline — astrologer sets that themselves.
export async function unblockAstrologer(adminId: string, astrologerId: string) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await db
    .update(astrologers)
    .set({ isBlocked: false, blockedReason: null, updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.unblock',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: 'Astrologer unblocked.',
    beforeState: { isBlocked: before.isBlocked },
    afterState: { isBlocked: false },
  });
}

// ── Commission override ───────────────────────────────────────────────────────

// Overrides the astrologer's individual commission — takes effect on the next consultation.
export async function overrideCommission(adminId: string, astrologerId: string, input: CommissionOverrideInput) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await db
    .update(astrologers)
    .set({ commissionPct: String(input.commissionPct), updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.commissionOverride',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Commission changed to ${input.commissionPct}%. Reason: ${input.reason}`,
    beforeState: { commissionPct: before.commissionPct },
    afterState: { commissionPct: input.commissionPct },
    metadata: { reason: input.reason },
  });
}
