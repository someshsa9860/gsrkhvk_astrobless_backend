import { eq, desc, sql } from 'drizzle-orm';
import { db, type DbTransaction } from '../../db/client.js';
import { wallets, walletTransactions, paymentOrders } from '../../db/schema/wallet.js';
import type { Wallet, WalletTransaction, NewWalletTransaction, PaymentOrder } from '../../db/schema/wallet.js';

export async function findWalletByCustomerId(customerId: string): Promise<Wallet | undefined> {
  return db.query.wallets.findFirst({ where: eq(wallets.customerId, customerId) });
}

export async function findWalletByCustomerIdForUpdate(customerId: string, tx: DbTransaction): Promise<Wallet | undefined> {
  const [row] = await (tx as typeof db).execute(
    sql`SELECT * FROM "wallets" WHERE "customerId" = ${customerId} FOR UPDATE`,
  );
  return row as Wallet | undefined;
}

export async function updateWalletBalance(walletId: string, newBalance: bigint, tx: DbTransaction): Promise<void> {
  await (tx as typeof db).update(wallets).set({ balancePaise: newBalance, updatedAt: new Date() }).where(eq(wallets.id, walletId));
}

export async function insertTransaction(data: NewWalletTransaction, tx?: DbTransaction): Promise<WalletTransaction> {
  const client = tx ?? db;
  const [row] = await (client as typeof db).insert(walletTransactions).values(data).returning();
  return row!;
}

export async function findTransactionByIdempotencyKey(key: string): Promise<WalletTransaction | undefined> {
  return db.query.walletTransactions.findFirst({ where: eq(walletTransactions.idempotencyKey, key) });
}

export async function createPaymentOrder(data: typeof paymentOrders.$inferInsert, tx?: DbTransaction): Promise<PaymentOrder> {
  const client = tx ?? db;
  const [row] = await (client as typeof db).insert(paymentOrders).values(data).returning();
  return row!;
}

export async function findPaymentOrderByIdempotencyKey(key: string): Promise<PaymentOrder | undefined> {
  return db.query.paymentOrders.findFirst({ where: eq(paymentOrders.idempotencyKey, key) });
}

export async function updatePaymentOrder(id: string, data: Partial<typeof paymentOrders.$inferInsert>, tx?: DbTransaction): Promise<void> {
  const client = tx ?? db;
  await (client as typeof db).update(paymentOrders).set({ ...data, updatedAt: new Date() }).where(eq(paymentOrders.id, id));
}

export async function listTransactions(customerId: string, page: number, limit: number): Promise<{ items: WalletTransaction[]; total: number }> {
  const offset = (page - 1) * limit;
  const [items, countResult] = await Promise.all([
    db.query.walletTransactions.findMany({
      where: eq(walletTransactions.customerId, customerId),
      limit,
      offset,
      orderBy: [desc(walletTransactions.createdAt)],
    }),
    db.select({ count: sql<number>`count(*)` }).from(walletTransactions).where(eq(walletTransactions.customerId, customerId)),
  ]);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}
