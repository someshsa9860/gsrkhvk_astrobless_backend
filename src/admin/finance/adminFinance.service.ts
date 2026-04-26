// Admin finance service: wallet transactions ledger view, payout management, and payment orders.

import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { TransactionListQuery, PayoutListQuery, ApprovePayoutInput, PaymentOrderListQuery } from './adminFinance.schema.js';

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listTransactions(q: TransactionListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.type) where['type'] = q.type;
  if (q.direction) where['direction'] = q.direction;
  if (q.customerId) where['customerId'] = q.customerId;
  if (q.from || q.to) {
    const createdAt: Record<string, Date> = {};
    if (q.from) createdAt['gte'] = new Date(q.from);
    if (q.to) createdAt['lte'] = new Date(q.to);
    where['createdAt'] = createdAt;
  }

  const [items, total] = await prisma.$transaction([
    prisma.walletTransaction.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.walletTransaction.count({ where }),
  ]);

  return toPagedResult(items, total, q);
}

// ── Payouts ───────────────────────────────────────────────────────────────────

export async function listPayouts(q: PayoutListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.status) where['status'] = q.status;
  if (q.astrologerId) where['astrologerId'] = q.astrologerId;
  if (q.from || q.to) {
    const createdAt: Record<string, Date> = {};
    if (q.from) createdAt['gte'] = new Date(q.from);
    if (q.to) createdAt['lte'] = new Date(q.to);
    where['createdAt'] = createdAt;
  }

  const [items, total] = await prisma.$transaction([
    prisma.payout.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.payout.count({ where }),
  ]);

  return toPagedResult(items, total, q);
}

// ── Payout approval ───────────────────────────────────────────────────────────

export async function approvePayout(adminId: string, payoutId: string, input: ApprovePayoutInput) {
  const payout = await prisma.payout.findFirst({ where: { id: payoutId } });
  if (!payout) throw new AppError('NOT_FOUND', 'Payout not found.', 404);

  if (payout.status !== 'queued') {
    throw new AppError('VALIDATION', `Payout cannot be approved in status '${payout.status}'.`, 400);
  }

  await prisma.payout.update({
    where: { id: payoutId },
    data: { status: 'processing', updatedAt: new Date() },
  });

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

// ── Payment orders ────────────────────────────────────────────────────────────

export async function listPaymentOrders(q: PaymentOrderListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.status) where['status'] = q.status;
  if (q.providerKey) where['providerKey'] = q.providerKey;
  if (q.platform) where['platform'] = q.platform;
  if (q.customerId) where['customerId'] = q.customerId;
  if (q.from || q.to) {
    const createdAt: Record<string, Date> = {};
    if (q.from) createdAt['gte'] = new Date(q.from);
    if (q.to) createdAt['lte'] = new Date(q.to);
    where['createdAt'] = createdAt;
  }

  const [items, total] = await prisma.$transaction([
    prisma.paymentOrder.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
    }),
    prisma.paymentOrder.count({ where }),
  ]);

  return toPagedResult(items, total, q);
}

export async function getPaymentOrder(id: string) {
  const order = await prisma.paymentOrder.findFirst({
    where: { id },
    include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Payment order not found.', 404);
  return order;
}
