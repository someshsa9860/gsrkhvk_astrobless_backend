// Admin finance service: wallet transactions ledger view and payout management.

import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { walletTransactions } from '../../db/schema/wallet.js';
import { payouts } from '../../db/schema/consultations.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { TransactionListQuery, PayoutListQuery, ApprovePayoutInput } from './adminFinance.schema.js';

// ── Transactions ──────────────────────────────────────────────────────────────

// Returns the raw ledger view — all walletTransactions rows with filters.
export async function listTransactions(q: TransactionListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.type) conditions.push(eq(walletTransactions.type, q.type));
  if (q.direction) conditions.push(eq(walletTransactions.direction, q.direction));
  if (q.customerId) conditions.push(eq(walletTransactions.customerId, q.customerId));
  if (q.from) conditions.push(sql`${walletTransactions.createdAt} >= ${new Date(q.from)}`);
  if (q.to) conditions.push(sql`${walletTransactions.createdAt} <= ${new Date(q.to)}`);

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.walletTransactions.findMany({ where, limit, offset, orderBy: [desc(walletTransactions.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(walletTransactions).where(where),
  ]);

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// ── Payouts ───────────────────────────────────────────────────────────────────

// Returns paginated payouts, filterable by status and astrologer.
export async function listPayouts(q: PayoutListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.status) conditions.push(eq(payouts.status, q.status));
  if (q.astrologerId) conditions.push(eq(payouts.astrologerId, q.astrologerId));
  if (q.from) conditions.push(sql`${payouts.createdAt} >= ${new Date(q.from)}`);
  if (q.to) conditions.push(sql`${payouts.createdAt} <= ${new Date(q.to)}`);

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.payouts.findMany({ where, limit, offset, orderBy: [desc(payouts.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(payouts).where(where),
  ]);

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// ── Payout approval ───────────────────────────────────────────────────────────

// Moving a payout to 'processing' triggers the actual provider call in a downstream job.
export async function approvePayout(adminId: string, payoutId: string, input: ApprovePayoutInput) {
  const payout = await db.query.payouts.findFirst({ where: eq(payouts.id, payoutId) });
  if (!payout) throw new AppError('NOT_FOUND', 'Payout not found.', 404);

  if (payout.status !== 'queued') {
    throw new AppError('VALIDATION', `Payout cannot be approved in status '${payout.status}'.`, 400);
  }

  await db
    .update(payouts)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(payouts.id, payoutId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'payout.approve',
    targetType: 'payout',
    targetId: payoutId,
    summary: `Payout approved. ${input.reason ? `Note: ${input.reason}` : ''}`,
    beforeState: { status: payout.status },
    afterState: { status: 'processing' },
    metadata: { amount: payout.amount.toString() },
  });

  return { payoutId, status: 'processing' };
}
