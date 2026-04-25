// Admin consultation service: list, detail, transcript view, force end.

import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { ConsultationListQuery, ForceEndInput } from './adminConsultations.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

export async function listConsultations(q: ConsultationListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.status) where['status'] = q.status;
  if (q.type) where['type'] = q.type;
  if (q.customerId) where['customerId'] = q.customerId;
  if (q.astrologerId) where['astrologerId'] = q.astrologerId;
  if (q.from || q.to) {
    const createdAt: Record<string, Date> = {};
    if (q.from) createdAt['gte'] = new Date(q.from);
    if (q.to) createdAt['lte'] = new Date(q.to);
    where['createdAt'] = createdAt;
  }

  const [items, total] = await prisma.$transaction([
    prisma.consultation.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.consultation.count({ where }),
  ]);

  return toPagedResult(items, total, q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getConsultation(id: string) {
  const consultation = await prisma.consultation.findFirst({ where: { id } });
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  return consultation;
}

// ── Transcript ────────────────────────────────────────────────────────────────

export async function listMessages(adminId: string, consultationId: string, page: number, limit: number) {
  const consultation = await prisma.consultation.findFirst({ where: { id: consultationId } });
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);

  const offset = (page - 1) * limit;
  const [items, total] = await prisma.$transaction([
    prisma.message.findMany({
      where: { consultationId },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.message.count({ where: { consultationId } }),
  ]);

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'consultation.transcriptView',
    targetType: 'consultation',
    targetId: consultationId,
    summary: `Admin viewed transcript for consultation ${consultationId}`,
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ── Force end ─────────────────────────────────────────────────────────────────

export async function forceEnd(adminId: string, consultationId: string, input: ForceEndInput) {
  const consultation = await prisma.consultation.findFirst({ where: { id: consultationId } });
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);

  if (consultation.status === 'ended' || consultation.status === 'cancelled') {
    throw new AppError('VALIDATION', 'Consultation is already ended.', 400);
  }

  await prisma.consultation.update({
    where: { id: consultationId },
    data: { status: 'ended', endedAt: new Date(), endReason: `adminForceEnd:${input.reason}` },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'consultation.forceEnd',
    targetType: 'consultation',
    targetId: consultationId,
    summary: `Admin force-ended consultation. Reason: ${input.reason}`,
    beforeState: { status: consultation.status },
    afterState: { status: 'ended', endReason: input.reason },
  });
}
