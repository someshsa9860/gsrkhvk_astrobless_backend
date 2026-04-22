// Admin consultation service: list, detail, transcript view, force end.

import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { consultations, messages } from '../../db/schema/consultations.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { ConsultationListQuery, ForceEndInput } from './adminConsultations.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

// All filters are composable — any combination of status, type, customerId, astrologerId.
export async function listConsultations(q: ConsultationListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.status) conditions.push(eq(consultations.status, q.status));
  if (q.type) conditions.push(eq(consultations.type, q.type));
  if (q.customerId) conditions.push(eq(consultations.customerId, q.customerId));
  if (q.astrologerId) conditions.push(eq(consultations.astrologerId, q.astrologerId));
  if (q.from) conditions.push(sql`${consultations.createdAt} >= ${new Date(q.from)}`);
  if (q.to) conditions.push(sql`${consultations.createdAt} <= ${new Date(q.to)}`);

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.consultations.findMany({ where, limit, offset, orderBy: [desc(consultations.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(consultations).where(where),
  ]);

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getConsultation(id: string) {
  const consultation = await db.query.consultations.findFirst({ where: eq(consultations.id, id) });
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);
  return consultation;
}

// ── Transcript ────────────────────────────────────────────────────────────────

// Viewing the transcript is a sensitive action — always write an audit entry.
export async function listMessages(adminId: string, consultationId: string, page: number, limit: number) {
  const consultation = await db.query.consultations.findFirst({ where: eq(consultations.id, consultationId) });
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);

  const offset = (page - 1) * limit;
  const [items, countResult] = await Promise.all([
    db.query.messages.findMany({
      where: eq(messages.consultationId, consultationId),
      limit,
      offset,
      orderBy: [desc(messages.createdAt)],
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.consultationId, consultationId)),
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
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
    totalPages: Math.ceil(Number(countResult[0]?.count ?? 0) / limit),
  };
}

// ── Force end ─────────────────────────────────────────────────────────────────

// Force-ends a stuck consultation; billing finalisation is left to the existing
// consultation lifecycle service rather than duplicated here.
export async function forceEnd(adminId: string, consultationId: string, input: ForceEndInput) {
  const consultation = await db.query.consultations.findFirst({ where: eq(consultations.id, consultationId) });
  if (!consultation) throw new AppError('NOT_FOUND', 'Consultation not found.', 404);

  if (consultation.status === 'ended' || consultation.status === 'cancelled') {
    throw new AppError('VALIDATION', 'Consultation is already ended.', 400);
  }

  await db
    .update(consultations)
    .set({ status: 'ended', endedAt: new Date(), endReason: `adminForceEnd:${input.reason}` })
    .where(eq(consultations.id, consultationId));

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
