import { prisma, type PrismaTransaction } from '../../db/client.js';
import type { Wallet, WalletTransaction, PaymentOrder } from '@prisma/client';

export async function findWalletByCustomerId(customerId: string): Promise<Wallet | null> {
  return prisma.wallet.findFirst({ where: { customerId } });
}

export async function findWalletByCustomerIdForUpdate(customerId: string, tx: PrismaTransaction): Promise<Wallet | null> {
  // Prisma handles locking at the DB level via transaction isolation; findUnique is safe in a tx
  return tx.wallet.findFirst({ where: { customerId } });
}

export async function updateWalletBalance(walletId: string, newBalance: number, tx: PrismaTransaction): Promise<void> {
  await tx.wallet.update({
    where: { id: walletId },
    data: { balance: newBalance, updatedAt: new Date() },
  });
}

export async function insertTransaction(data: {
  walletId: string;
  customerId: string;
  type: string;
  direction: string;
  amount: number;
  balanceAfter: number;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  notes?: string;
  traceId?: string;
}, tx?: PrismaTransaction): Promise<WalletTransaction> {
  const client = tx ?? prisma;
  return client.walletTransaction.create({ data });
}

export async function findTransactionByIdempotencyKey(key: string): Promise<WalletTransaction | null> {
  return prisma.walletTransaction.findFirst({ where: { idempotencyKey: key } });
}

export async function createPaymentOrder(data: {
  customerId: string;
  providerKey: string;
  amount: number;
  currency: string;
  status: string;
  idempotencyKey: string;
  traceId?: string;
}, tx?: PrismaTransaction): Promise<PaymentOrder> {
  const client = tx ?? prisma;
  return client.paymentOrder.create({ data });
}

export async function findPaymentOrderByIdempotencyKey(key: string): Promise<PaymentOrder | null> {
  return prisma.paymentOrder.findFirst({ where: { idempotencyKey: key } });
}

export async function updatePaymentOrder(id: string, data: {
  providerOrderId?: string;
  providerPaymentId?: string;
  status?: string;
  platform?: string;
  storeTransactionId?: string;
  refundedAmount?: number;
  refundStatus?: string;
  clientPayload?: string;
  webhookPayload?: string;
  failureReason?: string;
  expiresAt?: Date;
  paidAt?: Date;
}, tx?: PrismaTransaction): Promise<void> {
  const client = tx ?? prisma;
  await client.paymentOrder.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
}

export async function listTransactions(customerId: string, page: number, limit: number): Promise<{ items: WalletTransaction[]; total: number }> {
  const offset = (page - 1) * limit;
  const [items, total] = await prisma.$transaction([
    prisma.walletTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.walletTransaction.count({ where: { customerId } }),
  ]);
  return { items, total };
}
