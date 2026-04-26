import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { CustomerListQuery, WalletAdjustInput, CreateCustomerInput, UpdateCustomerInput } from './adminCustomers.schema.js';
import { v4 as uuidv4 } from 'uuid';
import { sendPush } from '../../modules/notifications/notifications.service.js';

// ── List ──────────────────────────────────────────────────────────────────────

export async function listCustomers(q: CustomerListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
  if (q.isBlocked !== undefined) where.isBlocked = q.isBlocked;
  if (q.signupSince) where.createdAt = { gte: new Date(q.signupSince) };

  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.customer.count({ where }),
  ]);

  return toPagedResult(items, total, q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findFirst({ where: { id } });
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  const [wallet, stats] = await Promise.all([
    prisma.wallet.findFirst({ where: { customerId: id } }),
    prisma.consultation.aggregate({
      where: { customerId: id },
      _count: { id: true },
      _sum: { totalCharged: true },
    }),
  ]);

  return {
    ...customer,
    walletBalance: wallet?.balance ?? 0,
    totalConsultations: stats._count.id ?? 0,
    totalSpend: stats._sum.totalCharged ?? 0,
  };
}

// ── Block / Unblock ───────────────────────────────────────────────────────────

export async function blockCustomer(adminId: string, customerId: string, reason: string) {
  const before = await prisma.customer.findFirst({ where: { id: customerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  await prisma.customer.update({ where: { id: customerId }, data: { isBlocked: true, blockedReason: reason } });

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

export async function unblockCustomer(adminId: string, customerId: string) {
  const before = await prisma.customer.findFirst({ where: { id: customerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  await prisma.customer.update({ where: { id: customerId }, data: { isBlocked: false, blockedReason: null } });

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

export async function walletCredit(adminId: string, customerId: string, input: WalletAdjustInput) {
  const wallet = await prisma.wallet.findFirst({ where: { customerId } });
  if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found for this customer.', 404);

  const newBalance = wallet.balance + input.amount;

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance, updatedAt: new Date() } });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        customerId,
        type: input.type,
        direction: 'CREDIT',
        amount: input.amount,
        balanceAfter: newBalance,
        referenceType: 'adminCredit',
        idempotencyKey: uuidv4(),
        notes: input.reason,
      },
    });

    await writeAuditLog(
      {
        actorType: 'admin',
        actorId: adminId,
        action: 'customer.walletCredit',
        targetType: 'customer',
        targetId: customerId,
        summary: `Admin credited ${input.amount} (${input.type}). Reason: ${input.reason}`,
        beforeState: { balance: wallet.balance },
        afterState: { balance: newBalance },
        metadata: { type: input.type },
      },
      tx,
    );
  });

  const displayAmount = input.amount.toFixed(2);
  sendPush('customer', customerId, 'Wallet Updated', `₹${displayAmount} has been added to your wallet by support.`, { type: 'walletUpdated' }).catch(() => {});

  return { newBalance };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCustomer(adminId: string, input: CreateCustomerInput) {
  const created = await prisma.customer.create({
    data: {
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      gender: input.gender ?? null,
      dob: input.dob ? new Date(input.dob) : null,
    },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'customer.create',
    targetType: 'customer',
    targetId: created.id,
    summary: `Admin created customer "${input.name ?? input.email ?? input.phone}"`,
    beforeState: null,
    afterState: created as unknown as Record<string, unknown>,
  });

  return created;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCustomer(adminId: string, customerId: string, input: UpdateCustomerInput) {
  const before = await prisma.customer.findFirst({ where: { id: customerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data['name'] = input.name;
  if (input.phone !== undefined) data['phone'] = input.phone;
  if (input.email !== undefined) data['email'] = input.email;
  if (input.gender !== undefined) data['gender'] = input.gender;
  if (input.dob !== undefined) data['dob'] = input.dob ? new Date(input.dob) : null;

  const updated = await prisma.customer.update({ where: { id: customerId }, data });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'customer.update',
    targetType: 'customer',
    targetId: customerId,
    summary: `Admin updated customer "${before.name ?? customerId}".`,
    beforeState: before as unknown as Record<string, unknown>,
    afterState: updated as unknown as Record<string, unknown>,
  });

  return updated;
}

// ── Delete (GDPR soft anonymise) ──────────────────────────────────────────────

export async function deleteCustomer(adminId: string, customerId: string) {
  const before = await prisma.customer.findFirst({ where: { id: customerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name: null,
      phone: null,
      email: null,
      gender: null,
      dob: null,
      profileImageKey: null,
      isBlocked: true,
      blockedReason: 'GDPR_DELETED',
    },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'customer.delete',
    targetType: 'customer',
    targetId: customerId,
    summary: 'Admin GDPR-deleted customer. PII anonymized.',
    beforeState: { name: before.name, phone: before.phone, email: before.email },
    afterState: { name: null, phone: null, email: null, isBlocked: true },
  });
}
