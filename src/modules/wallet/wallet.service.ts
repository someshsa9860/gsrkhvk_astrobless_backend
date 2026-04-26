import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client.js';
import * as repo from './wallet.repository.js';
import { providerRegistry } from '../payments/providers/providerRegistry.js';
import { walletTopupTotal } from '../../lib/metrics.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { reportError } from '../../observability/errorReporter.js';
import { DEFAULT_CURRENCY } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { PaymentProviderCapability, PaymentProviderKey } from '../payments/payments.types.js';
import type { Wallet, WalletTransaction } from '@prisma/client';
import { tracer } from '../../lib/tracing.js';
import { logger } from '../../lib/logger.js';
import { sendPush } from '../notifications/notifications.service.js';

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

    const order = await prisma.$transaction(async (tx) => {
      const created = await repo.createPaymentOrder({
        customerId,
        providerKey,
        amount,
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
        summary: `Customer initiated top-up of ${amount} via ${providerKey}`,
        beforeState: { balance: wallet.balance },
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
  const order = await prisma.paymentOrder.findFirst({ where: { providerOrderId } });

  if (!order) return;
  if (order.status === 'paid') return;

  await prisma.$transaction(async (tx) => {
    const wallet = await repo.findWalletByCustomerIdForUpdate(order.customerId, tx);
    if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found.', 404);

    const newBalance = wallet.balance + amount;
    await repo.updateWalletBalance(wallet.id, newBalance, tx);

    const txn = await repo.insertTransaction({
      walletId: wallet.id,
      customerId: order.customerId,
      type: 'TOPUP',
      direction: 'CREDIT',
      amount,
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
      summary: `Wallet credited ${amount} via ${providerKey}`,
      beforeState: { balance: wallet.balance },
      afterState: { balance: newBalance },
      metadata: { transactionId: txn.id },
    }, tx);
  });

  walletTopupTotal.inc({ provider: providerKey, status: 'succeeded' });

  const displayAmount = (amount / 100).toFixed(2);
  sendPush('customer', order.customerId, 'Wallet Topped Up', `₹${displayAmount} has been added to your wallet.`, { type: 'walletUpdated' }).catch(() => {});
}

export async function debitWallet(
  customerId: string,
  amount: number,
  idempotencyKey: string,
  referenceType: string,
  referenceId: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<WalletTransaction> {
  const existing = await repo.findTransactionByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const wallet = await repo.findWalletByCustomerIdForUpdate(customerId, tx);
  if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found.', 404);
  if (wallet.balance < amount) throw new AppError('WALLET_INSUFFICIENT', 'Insufficient wallet balance.', 402);

  const newBalance = wallet.balance - amount;
  await repo.updateWalletBalance(wallet.id, newBalance, tx);

  const txn = await repo.insertTransaction({
    walletId: wallet.id,
    customerId,
    type: 'CONSULTATION_DEBIT',
    direction: 'DEBIT',
    amount,
    balanceAfter: newBalance,
    referenceType,
    referenceId,
    idempotencyKey,
  }, tx);

  const displayAmount = (amount / 100).toFixed(2);
  sendPush('customer', customerId, 'Wallet Debited', `₹${displayAmount} deducted for consultation.`, { type: 'walletUpdated' }).catch(() => {});

  return txn;
}

export async function getTransactions(customerId: string, page: number, limit: number) {
  return repo.listTransactions(customerId, page, limit);
}

export async function listTopupProviders() {
  return providerRegistry.topupProviders().map((p) => ({ key: p.key, capabilities: p.capabilities }));
}

/**
 * Verify an in-app purchase from Google Play or Apple IAP and credit the wallet.
 * Idempotent: duplicate storeTransactionId returns the existing walletTransactionId.
 */
export async function verifyIapTopup(input: {
  customerId: string;
  platform: 'android' | 'ios';
  productId: string;
  amount: number; // in 1/100 of ₹1
  idempotencyKey: string;
  /** Google Play: purchaseToken. Apple: base64 receipt data */
  token: string;
  /** Google Play: transactionId from BillingClient (for idempotency lookup). Apple: transactionId from StoreKit */
  transactionId: string;
  /** Android only */
  packageName?: string;
}): Promise<{ storeTransactionId: string; creditedAmount: number; walletTransactionId: string }> {
  const { customerId, platform, productId, amount, idempotencyKey, token, transactionId, packageName } = input;
  const span = tracer.startSpan('wallet.iapTopup');

  try {
    // Idempotency: if we've already processed this storeTransactionId, return early
    const existing = await repo.findTransactionByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { storeTransactionId: transactionId, creditedAmount: existing.amount, walletTransactionId: existing.id };
    }

    // Verify with the respective store
    let storeTransactionId: string;
    let resolvedProductId: string;
    const providerKey = platform === 'android' ? PaymentProviderKey.GOOGLE_PLAY : PaymentProviderKey.APPLE_IAP;

    if (platform === 'android') {
      const pkg = packageName ?? env.GOOGLE_PLAY_PACKAGE_NAME;
      if (!pkg) throw new AppError('PAYMENT_PROVIDER_ERROR', 'GOOGLE_PLAY_PACKAGE_NAME not configured.', 500);
      const { orderId, isValid } = await providerRegistry.getGooglePlay().verifyPurchase(pkg, productId, token);
      if (!isValid) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Google Play purchase is not valid.', 400);
      storeTransactionId = orderId;
      resolvedProductId = productId;
    } else {
      const { storeTransactionId: sid, isValid, productId: pid } = await providerRegistry.getAppleIap().verifyReceipt(token, transactionId);
      if (!isValid) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Apple IAP receipt is not valid.', 400);
      storeTransactionId = sid;
      resolvedProductId = pid;
    }

    // Check for duplicate storeTransactionId across all payment orders
    const dupOrder = await prisma.paymentOrder.findFirst({ where: { storeTransactionId } });
    if (dupOrder?.status === 'paid') {
      const dupTxn = await repo.findTransactionByIdempotencyKey(idempotencyKey);
      if (dupTxn) return { storeTransactionId, creditedAmount: dupTxn.amount, walletTransactionId: dupTxn.id };
    }

    // Create payment order record
    const order = await repo.createPaymentOrder({
      customerId,
      providerKey,
      amount,
      currency: DEFAULT_CURRENCY,
      status: 'created',
      idempotencyKey,
      traceId: (await import('../../lib/context.js')).getContext().traceId,
    });
    await repo.updatePaymentOrder(order.id, { platform, storeTransactionId, status: 'pending' });

    // Credit the wallet inside a transaction
    let walletTxnId: string;
    await prisma.$transaction(async (tx) => {
      const wallet = await repo.findWalletByCustomerIdForUpdate(customerId, tx);
      if (!wallet) throw new AppError('NOT_FOUND', 'Wallet not found.', 404);

      const newBalance = wallet.balance + amount;
      await repo.updateWalletBalance(wallet.id, newBalance, tx);

      const txn = await repo.insertTransaction({
        walletId: wallet.id,
        customerId,
        type: 'TOPUP',
        direction: 'CREDIT',
        amount,
        balanceAfter: newBalance,
        referenceType: 'paymentOrder',
        referenceId: order.id,
        idempotencyKey,
        notes: `IAP via ${providerKey} — product ${resolvedProductId}`,
      }, tx);
      walletTxnId = txn.id;

      await repo.updatePaymentOrder(order.id, { status: 'paid', providerPaymentId: storeTransactionId, paidAt: new Date() }, tx);

      await writeAuditLog({
        actorType: 'customer',
        actorId: customerId,
        action: 'wallet.topup',
        targetType: 'wallet',
        targetId: wallet.id,
        summary: `Wallet credited ${amount} via ${providerKey} (IAP) — product ${resolvedProductId}`,
        beforeState: { balance: wallet.balance },
        afterState: { balance: newBalance },
        metadata: { providerKey, storeTransactionId, productId: resolvedProductId, idempotencyKey },
      }, tx);
    });

    // Acknowledge Google Play purchase (non-blocking — failure doesn't break the credit)
    if (platform === 'android') {
      const pkg = packageName ?? env.GOOGLE_PLAY_PACKAGE_NAME;
      providerRegistry.getGooglePlay().acknowledgePurchase(pkg, productId, token).catch((err: unknown) => {
        logger.warn({ err, storeTransactionId }, 'Google Play acknowledge failed');
      });
    }

    walletTopupTotal.inc({ provider: providerKey, status: 'succeeded' });

    const displayAmount = (amount / 100).toFixed(2);
    sendPush('customer', customerId, 'Wallet Topped Up', `₹${displayAmount} added via ${platform === 'android' ? 'Google Play' : 'App Store'}.`, { type: 'walletUpdated' }).catch(() => {});

    span.setAttribute('status', 'OK');
    return { storeTransactionId, creditedAmount: amount, walletTransactionId: walletTxnId! };
  } catch (err) {
    span.recordException(err as Error);
    await reportError({ error: err as Error, source: 'httpRoute', sourceDetail: 'wallet.iapTopup', metadata: { customerId, platform } });
    throw err;
  } finally {
    span.end();
  }
}
