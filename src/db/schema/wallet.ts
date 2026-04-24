import { pgTable, uuid, text, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customerId').unique().notNull().references(() => customers.id),
  balance: doublePrecision('balance').notNull().default(0),
  locked: doublePrecision('locked').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const walletTransactions = pgTable('walletTransactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('walletId').notNull().references(() => wallets.id),
  customerId: uuid('customerId').notNull().references(() => customers.id),
  type: text('type').notNull(), // TOPUP | CONSULTATION_DEBIT | REFUND | BONUS | ADMIN_ADJUST
  direction: text('direction').notNull(), // CREDIT | DEBIT
  amount: doublePrecision('amount').notNull(),
  balanceAfter: doublePrecision('balanceAfter').notNull(),
  referenceType: text('referenceType'),
  referenceId: uuid('referenceId'),
  idempotencyKey: text('idempotencyKey').unique(),
  notes: text('notes'),
  traceId: text('traceId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  customerCreatedAtIdx: index('idx_walletTransactions_customerId_createdAt').on(t.customerId, t.createdAt),
}));

export const paymentOrders = pgTable('paymentOrders', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customerId').notNull().references(() => customers.id),
  providerKey: text('providerKey').notNull(),
  providerOrderId: text('providerOrderId'),
  providerPaymentId: text('providerPaymentId'),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  status: text('status').notNull(), // created | pending | paid | failed | expired
  idempotencyKey: text('idempotencyKey').unique().notNull(),
  clientPayload: text('clientPayload'), // JSON string
  webhookPayload: text('webhookPayload'), // JSON string
  failureReason: text('failureReason'),
  expiresAt: timestamp('expiresAt', { withTimezone: true }),
  paidAt: timestamp('paidAt', { withTimezone: true }),
  traceId: text('traceId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type NewPaymentOrder = typeof paymentOrders.$inferInsert;
