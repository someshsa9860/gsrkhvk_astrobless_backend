import { prisma } from '../../db/client.js';
import { debitWallet } from '../wallet/wallet.service.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { consultationActive } from '../../lib/metrics.js';

const activeTimers = new Map<string, NodeJS.Timeout>();

export function startBillingTicker(
  consultationId: string,
  customerId: string,
  pricePerMin: number,
  onLowBalance: (secondsLeft: number, balance: number) => void,
  onAutoEnd: (reason: string) => void,
): void {
  if (activeTimers.has(consultationId)) return;

  consultationActive.inc();

  const timer = setInterval(async () => {
    try {
      const idempotencyKey = `billing:${consultationId}:${Date.now()}`;

      await prisma.$transaction(async (tx) => {
        await debitWallet(customerId, pricePerMin, idempotencyKey, 'consultation', consultationId, tx);
      });

      const wallet = await prisma.wallet.findFirst({
        where: { customerId },
        select: { balance: true },
      });

      if (!wallet) return;

      const remainingMinutes = wallet.balance / pricePerMin;
      const secondsLeft = Math.floor(remainingMinutes * 60);

      if (secondsLeft <= 60) {
        onLowBalance(secondsLeft, wallet.balance);
      }

      if (wallet.balance < pricePerMin) {
        stopBillingTicker(consultationId);
        onAutoEnd('lowBalance');
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'WALLET_INSUFFICIENT') {
        stopBillingTicker(consultationId);
        onAutoEnd('lowBalance');
      } else {
        logger.error({ err, consultationId }, 'Billing tick error');
      }
    }
  }, 60_000);

  activeTimers.set(consultationId, timer);
}

export function stopBillingTicker(consultationId: string): void {
  const timer = activeTimers.get(consultationId);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(consultationId);
    consultationActive.dec();
  }
}

export function isTickerActive(consultationId: string): boolean {
  return activeTimers.has(consultationId);
}
