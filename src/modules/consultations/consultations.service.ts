import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client.js';
import * as repo from './consultations.repository.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { reportError } from '../../observability/errorReporter.js';
import { startBillingTicker, stopBillingTicker } from './billingTicker.js';
import { consultationDuration } from '../../lib/metrics.js';
import type { Consultation, Message } from '@prisma/client';
import type { z } from 'zod';
import type { RequestConsultationSchema, SubmitReviewSchema } from './consultations.schema.js';
import { tracer } from '../../lib/tracing.js';
import { sendPush } from '../notifications/notifications.service.js';

let emitToSocket: ((room: string, event: string, data: unknown) => void) | null = null;
export function setSocketEmitter(fn: typeof emitToSocket): void {
  emitToSocket = fn;
}

export async function requestConsultation(customerId: string, input: z.infer<typeof RequestConsultationSchema>): Promise<Consultation> {
  const astrologer = await prisma.astrologer.findFirst({ where: { id: input.astrologerId } });
  if (!astrologer || !astrologer.isVerified || astrologer.isBlocked) throw new AppError('NOT_FOUND', 'Astrologer not available.', 404);
  if (astrologer.isBusy) throw new AppError('ASTROLOGER_BUSY', 'Astrologer is currently busy.', 409);

  const pricePerMin = input.type === 'voice' ? astrologer.pricePerMinCall
    : input.type === 'video' ? astrologer.pricePerMinVideo
    : astrologer.pricePerMinChat;

  const consultation = await prisma.$transaction(async (tx) => {
    const c = await tx.consultation.create({
      data: {
        customerId,
        astrologerId: input.astrologerId,
        type: input.type,
        status: 'requested',
        pricePerMin,
        commissionPct: astrologer.commissionPct,
      },
    });

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
    pricePerMin,
  });

  return consultation;
}

export async function acceptConsultation(astrologerId: string, consultationId: string): Promise<Consultation> {
  const consultation = await repo.findById(consultationId);
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  if (consultation.astrologerId !== astrologerId) throw new AppError('FORBIDDEN', 'Not your consultation.', 403);
  if (consultation.status !== 'requested') throw new AppError('CONSULTATION_NOT_ACTIVE', 'Consultation cannot be accepted.', 409);

  await prisma.$transaction(async (tx) => {
    await tx.consultation.update({ where: { id: consultationId }, data: { status: 'accepted', acceptedAt: new Date() } });
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

  await prisma.$transaction(async (tx) => {
    await tx.consultation.update({ where: { id: consultationId }, data: { status: 'active', startedAt: new Date() } });
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
    consultation.pricePerMin,
    (secondsLeft, balance) => {
      emitToSocket?.(`consultation:${consultationId}`, 'billing:lowBalance', { consultationId, secondsLeft });
      emitToSocket?.(`customer:${consultation.customerId}`, 'billing:tick', {
        consultationId,
        remainingSeconds: secondsLeft,
        balance,
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
  const totalCharged = Math.floor(durationSeconds / 60) * consultation.pricePerMin;
  const commissionPct = Number(consultation.commissionPct) / 100;
  const platformEarning = Math.round(totalCharged * commissionPct * 100) / 100;
  const astrologerEarning = Math.round((totalCharged - platformEarning) * 100) / 100;

  await prisma.$transaction(async (tx) => {
    await tx.consultation.update({
      where: { id: consultationId },
      data: { status: 'ended', endedAt, durationSeconds, totalCharged, astrologerEarning, platformEarning, endReason: reason },
    });

    await tx.astrologerEarning.create({
      data: {
        astrologerId: consultation.astrologerId,
        consultationId,
        gross: totalCharged,
        commissionPct: consultation.commissionPct,
        commission: platformEarning,
        net: astrologerEarning,
      },
    });

    await writeAuditLog({
      actorType: 'system',
      actorId,
      action: 'consultation.end',
      targetType: 'consultation',
      targetId: consultationId,
      summary: `Consultation ended. Duration: ${durationSeconds}s, charged: ${totalCharged}`,
      afterState: { durationSeconds, totalCharged, reason },
    }, tx);
  });

  consultationDuration.observe(durationSeconds);
  emitToSocket?.(`consultation:${consultationId}`, 'consultation:ended', { consultationId, reason, durationSeconds });

  const displayEarning = (astrologerEarning / 100).toFixed(2);
  sendPush('astrologer', consultation.astrologerId, 'New Earning', `₹${displayEarning} earned from consultation.`, { type: 'earningsUpdate', consultationId }).catch(() => {});

  return (await repo.findById(consultationId))!;
}

export async function submitReview(customerId: string, consultationId: string, input: z.infer<typeof SubmitReviewSchema>): Promise<void> {
  const consultation = await repo.findById(consultationId);
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  if (consultation.customerId !== customerId) throw new AppError('FORBIDDEN', 'Not your consultation.', 403);
  if (consultation.status !== 'ended') throw new AppError('CONSULTATION_NOT_ACTIVE', 'Can only review ended consultations.', 409);

  await prisma.review.create({
    data: {
      consultationId,
      customerId,
      astrologerId: consultation.astrologerId,
      rating: input.rating,
      comment: input.comment,
    },
  });

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
