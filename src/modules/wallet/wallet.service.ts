import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/client.js';
import * as repo from './wallet.repository.js';
import { providerRegistry } from '../payments/providers/providerRegistry.js';
import { walletTopupTotal } from '../../lib/metrics.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { reportError } from '../../observability/errorReporter.js';
import { DEFAULT_CURRENCY } from '../../config/constants.js';
import { PaymentProviderCapability, type PaymentProviderKey } from '../payments/payments.types.js';
import type { Wallet, WalletTransaction, PaymentOrder } from '../../db/schema/wallet.js';
import { tracer } from '../../lib/tracing.js';

export async function getWallet(customerId: string): Promise<Wallet> {
  const wallet = await repo.findWalletByCustomerId(customerId);
  if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found.', 404);
  return wallet;
}

export async function initiateTopup(
  customerId: string,
  amount: number,
  providerKey: PaymentProviderKey,
  idempotencyKey: string,
): Promise<{ orderId: string; clientPayload: Record<string, unknown> }> {
  const span = tracer.startSpan('wallet.topup');
  try {
    const existing = await repo.findPaymentOrderByIdempotencyKey(idempotencyKey);
    if (existing) return { orderId: existing.id, clientPayload: JSON.parse(existing.clientPayload ?? '{}') as Record<string, unknown> };

    const wallet = await repo.findWalletByCustomerId(customerId);
    if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found.', 404);

    const order = await db.transaction(async (tx) => {
      const created = await repo.createPaymentOrder({
        customerId,
        providerKey,
        amount: BigInt(amount),
        currency: DEFAULT_CURRENCY,
        status: 'created',
        idempotencyKey,
        traceId: (await import('../../lib/context.js')).getContext().traceId,
      }, tx);

      await writeAuditLog({
        actorType: 'customer',
        actorId: customerId,
        action: 'wallet.topupInitiated',
        targetType: 'paymentOrder',
        targetId: created.id,
        summary: `Customer initiated ₹${amount / 100} top-up via ${providerKey}`,
        beforeState: { balance: Number(wallet.balance) },
        metadata: { providerKey, idempotencyKey },
      }, tx);

      return created;
    });

    const provider = providerRegistry.get(providerKey);
    const result = await provider.createOrder({ customerId, amount, currency: DEFAULT_CURRENCY, idempotencyKey });

    await repo.updatePaymentOrder(order.id, {
      providerOrderId: result.providerOrderId,
      status: 'pending',
      clientPayload: JSON.stringify(result.clientPayload),
      expiresAt: result.expiresAt,
    });

    walletTopupTotal.inc({ provider: providerKey, status: 'initiated' });
    span.setAttribute('status', 'OK');
    return { orderId: order.id, clientPayload: result.clientPayload };
  } catch (err) {
    span.recordException(err as Error);
    await reportError({ error: err as Error, source: 'httpRoute', sourceDetail: 'wallet.topup', metadata: { customerId, providerKey } });
    throw err;
  } finally {
    span.end();
  }
}

export async function applyTopupCredit(
  providerKey: PaymentProviderKey,
  providerOrderId: string,
  providerPaymentId: string,
  amount: number,
): Promise<void> {
  const order = await db.query.paymentOrders.findFirst({
    where: (t, { eq }) => eq(t.providerOrderId, providerOrderId),
  });

  if (!order) return; // unknown order — log and ignore
  if (order.status === 'paid') return; // idempotent

  await db.transaction(async (tx) => {
    const wallet = await repo.findWalletByCustomerIdForUpdate(order.customerId, tx);
    if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found.', 404);

    const newBalance = wallet.balance + BigInt(amount);
    await repo.updateWalletBalance(wallet.id, newBalance, tx);

    const txn = await repo.insertTransaction({
      walletId: wallet.id,
      customerId: order.customerId,
      type: 'TOPUP',
      direction: 'CREDIT',
      amount: BigInt(amount),
      balanceAfter: newBalance,
      referenceType: 'paymentOrder',
      referenceId: order.id,
      idempotencyKey: `topup:${providerOrderId}`,
    }, tx);

    await repo.updatePaymentOrder(order.id, {
      status: 'paid',
      providerPaymentId,
      paidAt: new Date(),
    }, tx);

    await writeAuditLog({
      actorType: 'provider',
      actorId: order.customerId,
      action: 'wallet.topup',
      targetType: 'wallet',
      targetId: wallet.id,
      summary: `Wallet credited ₹${amount / 100} via ${providerKey}`,
      beforeState: { balance: Number(wallet.balance) },
      afterState: { balance: Number(newBalance) },
      metadata: { transactionId: txn.id },
    }, tx);
  });

  walletTopupTotal.inc({ provider: providerKey, status: 'succeeded' });
}

export async function debitWallet(
  customerId: string,
  amount: number,
  idempotencyKey: string,
  referenceType: string,
  referenceId: string,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<WalletTransaction> {
  const existing = await repo.findTransactionByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const wallet = await repo.findWalletByCustomerIdForUpdate(customerId, tx);
  if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found.', 404);
  if (wallet.balance < BigInt(amount)) throw new AppError('WALLET_INSUFFICIENT', 'Insufficient wallet balance.', 402);

  const newBalance = wallet.balance - BigInt(amount);
  await repo.updateWalletBalance(wallet.id, newBalance, tx);

  return repo.insertTransaction({
    walletId: wallet.id,
    customerId,
    type: 'CONSULTATION_DEBIT',
    direction: 'DEBIT',
    amount: BigInt(amount),
    balanceAfter: newBalance,
    referenceType,
    referenceId,
    idempotencyKey,
  }, tx);
}

export async function getTransactions(customerId: string, page: number, limit: number) {
  return repo.listTransactions(customerId, page, limit);
}

export async function listTopupProviders() {
  return providerRegistry.topupProviders().map((p) => ({ key: p.key, capabilities: p.capabilities }));
}
