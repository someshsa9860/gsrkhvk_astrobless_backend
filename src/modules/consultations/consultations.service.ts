import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as repo from './consultations.repository.js';
import { astrologers } from '../../db/schema/astrologers.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { reportError } from '../../observability/errorReporter.js';
import { startBillingTicker, stopBillingTicker } from './billingTicker.js';
import { consultationDuration } from '../../lib/metrics.js';
import type { Consultation, Message } from '../../db/schema/consultations.js';
import type { z } from 'zod';
import type { RequestConsultationSchema, SubmitReviewSchema } from './consultations.schema.js';
import { tracer } from '../../lib/tracing.js';

// Injected at startup — avoids circular dep
let emitToSocket: ((room: string, event: string, data: unknown) => void) | null = null;
export function setSocketEmitter(fn: typeof emitToSocket): void {
  emitToSocket = fn;
}

export async function requestConsultation(customerId: string, input: z.infer<typeof RequestConsultationSchema>): Promise<Consultation> {
  const astrologer = await db.query.astrologers.findFirst({ where: eq(astrologers.id, input.astrologerId) });
  if (!astrologer || !astrologer.isVerified || astrologer.isBlocked) throw new AppError('NOT_FOUND', 'Astrologer not available.', 404);
  if (astrologer.isBusy) throw new AppError('ASTROLOGER_BUSY', 'Astrologer is currently busy.', 409);

  const pricePerMinPaise = input.type === 'voice' ? astrologer.pricePerMinCallPaise
    : input.type === 'video' ? astrologer.pricePerMinVideoPaise
    : astrologer.pricePerMinChatPaise;

  const consultation = await db.transaction(async (tx) => {
    const c = await repo.create({
      customerId,
      astrologerId: input.astrologerId,
      type: input.type,
      status: 'requested',
      pricePerMinPaise,
      commissionPct: astrologer.commissionPct,
    }, tx);

    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: 'consultation.request',
      targetType: 'consultation',
      targetId: c.id,
      summary: `Customer requested ${input.type} consultation with astrologer ${input.astrologerId}`,
    }, tx);

    return c;
  });

  emitToSocket?.(`astrologer:${input.astrologerId}`, 'call:incoming', {
    consultationId: consultation.id,
    customerId,
    type: input.type,
    pricePerMinPaise,
  });

  return consultation;
}

export async function acceptConsultation(astrologerId: string, consultationId: string): Promise<Consultation> {
  const consultation = await repo.findById(consultationId);
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  if (consultation.astrologerId !== astrologerId) throw new AppError('FORBIDDEN', 'Not your consultation.', 403);
  if (consultation.status !== 'requested') throw new AppError('CONSULTATION_NOT_ACTIVE', 'Consultation cannot be accepted.', 409);

  await db.transaction(async (tx) => {
    await repo.updateStatus(consultationId, { status: 'accepted', acceptedAt: new Date() }, tx);
    await writeAuditLog({
      actorType: 'astrologer',
      actorId: astrologerId,
      action: 'consultation.accept',
      targetType: 'consultation',
      targetId: consultationId,
      summary: 'Astrologer accepted consultation',
    }, tx);
  });

  emitToSocket?.(`consultation:${consultationId}`, 'consultation:accepted', { consultationId });

  return (await repo.findById(consultationId))!;
}

export async function startConsultation(actorId: string, consultationId: string): Promise<Consultation> {
  const consultation = await repo.findById(consultationId);
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  if (consultation.status !== 'accepted') throw new AppError('CONSULTATION_NOT_ACTIVE', 'Consultation must be accepted first.', 409);

  await db.transaction(async (tx) => {
    await repo.updateStatus(consultationId, { status: 'active', startedAt: new Date() }, tx);
    await writeAuditLog({
      actorType: consultation.customerId === actorId ? 'customer' : 'astrologer',
      actorId,
      action: 'consultation.start',
      targetType: 'consultation',
      targetId: consultationId,
      summary: 'Consultation started',
    }, tx);
  });

  startBillingTicker(
    consultationId,
    consultation.customerId,
    consultation.pricePerMinPaise,
    (secondsLeft, balancePaise) => {
      emitToSocket?.(`consultation:${consultationId}`, 'billing:lowBalance', { consultationId, secondsLeft });
      emitToSocket?.(`customer:${consultation.customerId}`, 'billing:tick', {
        consultationId,
        remainingSeconds: secondsLeft,
        balancePaise: Number(balancePaise),
      });
    },
    async (reason) => {
      try {
        await endConsultation(consultation.customerId, consultationId, reason as 'lowBalance');
      } catch (err) {
        await reportError({ error: err as Error, source: 'scheduledTask', sourceDetail: 'billingTicker.autoEnd' });
      }
    },
  );

  return (await repo.findById(consultationId))!;
}

export async function endConsultation(actorId: string, consultationId: string, reason: string): Promise<Consultation> {
  const consultation = await repo.findById(consultationId);
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  if (consultation.status !== 'active' && consultation.status !== 'accepted') throw new AppError('CONSULTATION_NOT_ACTIVE', 'Consultation is not active.', 409);

  stopBillingTicker(consultationId);

  const endedAt = new Date();
  const startedAt = consultation.startedAt ?? endedAt;
  const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
  const totalChargedPaise = BigInt(Math.floor(durationSeconds / 60) * consultation.pricePerMinPaise);
  const commissionPct = Number(consultation.commissionPct) / 100;
  const platformPaise = BigInt(Math.round(Number(totalChargedPaise) * commissionPct));
  const astrologerPaise = totalChargedPaise - platformPaise;

  await db.transaction(async (tx) => {
    await repo.updateStatus(consultationId, {
      status: 'ended',
      endedAt,
      durationSeconds,
      totalChargedPaise,
      astrologerEarningPaise: astrologerPaise,
      platformEarningPaise: platformPaise,
      endReason: reason,
    }, tx);

    await repo.insertEarning({
      astrologerId: consultation.astrologerId,
      consultationId,
      grossPaise: totalChargedPaise,
      commissionPct: consultation.commissionPct,
      commissionPaise: platformPaise,
      netPaise: astrologerPaise,
    }, tx);

    await writeAuditLog({
      actorType: 'system',
      actorId,
      action: 'consultation.end',
      targetType: 'consultation',
      targetId: consultationId,
      summary: `Consultation ended. Duration: ${durationSeconds}s, charged: ₹${Number(totalChargedPaise) / 100}`,
      afterState: { durationSeconds, totalChargedPaise: Number(totalChargedPaise), reason },
    }, tx);
  });

  consultationDuration.observe(durationSeconds);
  emitToSocket?.(`consultation:${consultationId}`, 'consultation:ended', { consultationId, reason, durationSeconds });

  return (await repo.findById(consultationId))!;
}

export async function submitReview(customerId: string, consultationId: string, input: z.infer<typeof SubmitReviewSchema>): Promise<void> {
  const consultation = await repo.findById(consultationId);
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  if (consultation.customerId !== customerId) throw new AppError('FORBIDDEN', 'Not your consultation.', 403);
  if (consultation.status !== 'ended') throw new AppError('CONSULTATION_NOT_ACTIVE', 'Can only review ended consultations.', 409);

  await repo.insertReview({ consultationId, customerId, astrologerId: consultation.astrologerId, ...input });
  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'consultation.review',
    targetType: 'consultation',
    targetId: consultationId,
    summary: `Customer submitted rating ${input.rating}/5`,
  });
}

export async function getCustomerConsultations(customerId: string, page: number, limit: number) {
  return repo.listForCustomer(customerId, page, limit);
}

export async function getAstrologerConsultations(astrologerId: string, page: number, limit: number) {
  return repo.listForAstrologer(astrologerId, page, limit);
}
