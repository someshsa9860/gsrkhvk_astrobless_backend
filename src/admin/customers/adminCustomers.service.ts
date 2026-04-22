// Business logic for admin-facing customer management: list, block/unblock, wallet credit.

import { eq, ilike, desc, and, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema/customers.js';
import { wallets, walletTransactions } from '../../db/schema/wallet.js';
import { consultations } from '../../db/schema/consultations.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { CustomerListQuery, WalletAdjustInput } from './adminCustomers.schema.js';
import { v4 as uuidv4 } from 'uuid';

// ── List ──────────────────────────────────────────────────────────────────────

// Builds filters once and runs list + count in parallel to keep latency low.
export async function listCustomers(q: CustomerListQuery) {
  const { offset, limit } = paginationFrom(q);

  const conditions = [];
  if (q.search) conditions.push(ilike(customers.name, `%${q.search}%`));
  if (q.isBlocked !== undefined) conditions.push(eq(customers.isBlocked, q.isBlocked));
  if (q.signupSince) conditions.push(gte(customers.createdAt, new Date(q.signupSince)));
  // minSpend filter is applied post-join; skip in simple where for now (needs subquery — omitted for MVP).

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.customers.findMany({ where, limit, offset, orderBy: [desc(customers.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(customers).where(where),
  ]);

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

// Enriches a single customer with wallet balance + lifetime consultation stats.
export async function getCustomer(id: string) {
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  const [wallet, statsResult] = await Promise.all([
    db.query.wallets.findFirst({ where: eq(wallets.customerId, id) }),
    db
      .select({
        totalConsultations: sql<number>`count(*)`,
        totalSpendPaise: sql<string>`coalesce(sum("totalChargedPaise"), 0)`,
      })
      .from(consultations)
      .where(eq(consultations.customerId, id)),
  ]);

  return {
    ...customer,
    walletBalancePaise: wallet?.balancePaise ?? BigInt(0),
    totalConsultations: Number(statsResult[0]?.totalConsultations ?? 0),
    totalSpendPaise: BigInt(statsResult[0]?.totalSpendPaise ?? 0),
  };
}

// ── Block / Unblock ───────────────────────────────────────────────────────────

// Blocks a customer and writes before/after state so the audit diff is clear.
export async function blockCustomer(adminId: string, customerId: string, reason: string) {
  const before = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  await db.update(customers).set({ isBlocked: true, blockedReason: reason }).where(eq(customers.id, customerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'customer.block',
    targetType: 'customer',
    targetId: customerId,
    summary: `Customer blocked. Reason: ${reason}`,
    beforeState: { isBlocked: before.isBlocked, blockedReason: before.blockedReason },
    afterState: { isBlocked: true, blockedReason: reason },
  });
}

// Unblocks a customer and clears the blocked reason.
export async function unblockCustomer(adminId: string, customerId: string) {
  const before = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  await db.update(customers).set({ isBlocked: false, blockedReason: null }).where(eq(customers.id, customerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'customer.unblock',
    targetType: 'customer',
    targetId: customerId,
    summary: 'Customer unblocked.',
    beforeState: { isBlocked: before.isBlocked },
    afterState: { isBlocked: false },
  });
}

// ── Wallet credit ─────────────────────────────────────────────────────────────

// Credits the customer wallet; always creates a ledger row — never mutates balance alone.
export async function walletCredit(adminId: string, customerId: string, input: WalletAdjustInput) {
  const wallet = await db.query.wallets.findFirst({ where: eq(wallets.customerId, customerId) });
  if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found for this customer.', 404);

  const amountBigInt = BigInt(input.amountPaise);
  const newBalance = wallet.balancePaise + amountBigInt;

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({ balancePaise: newBalance, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));

    await tx.insert(walletTransactions).values({
      walletId: wallet.id,
      customerId,
      type: input.type,
      direction: 'CREDIT',
      amountPaise: amountBigInt,
      balanceAfterPaise: newBalance,
      referenceType: 'adminCredit',
      idempotencyKey: uuidv4(),
      notes: input.reason,
    });

    await writeAuditLog(
      {
        actorType: 'admin',
        actorId: adminId,
        action: 'customer.walletCredit',
        targetType: 'customer',
        targetId: customerId,
        summary: `Admin credited ₹${input.amountPaise / 100} (${input.type}). Reason: ${input.reason}`,
        beforeState: { balancePaise: wallet.balancePaise.toString() },
        afterState: { balancePaise: newBalance.toString() },
        metadata: { type: input.type },
      },
      tx,
    );
  });

  return { newBalancePaise: newBalance };
}
