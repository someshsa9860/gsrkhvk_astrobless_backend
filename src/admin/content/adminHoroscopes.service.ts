// Admin horoscopes service: CRUD + bulk generation + publish/unpublish.
// Bulk generation enqueues a BullMQ job — it never blocks the HTTP handler.

import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { horoscopeQueue } from '../../jobs/queues.js';
import type {
  HoroscopeListQuery,
  CreateHoroscopeInput,
  UpdateHoroscopeInput,
  BulkGenerateInput,
  SetPublishedInput,
} from './adminHoroscopes.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

export async function listHoroscopes(q: HoroscopeListQuery) {
  const limit = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;

  const where: Record<string, unknown> = {};
  if (q.sign) where['sign'] = q.sign;
  if (q.period) where['period'] = q.period;
  if (q.periodKey) where['periodKey'] = q.periodKey;
  if (q.isPublished !== undefined) where['isPublished'] = q.isPublished;
  if (q.from || q.to) {
    const createdAt: Record<string, Date> = {};
    if (q.from) createdAt['gte'] = new Date(q.from);
    if (q.to) createdAt['lte'] = new Date(q.to);
    where['createdAt'] = createdAt;
  }

  const rows = await prisma.horoscope.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });

  const total = rows.length;
  return {
    items: rows,
    page: q.page ?? 1,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// ── Get one ───────────────────────────────────────────────────────────────────

export async function getHoroscope(id: string) {
  const row = await prisma.horoscope.findFirst({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', `Horoscope ${id} not found.`, 404);
  return row;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createHoroscope(adminId: string, input: CreateHoroscopeInput) {
  const row = await prisma.horoscope.create({
    data: {
      sign: input.sign,
      period: input.period,
      periodKey: input.periodKey,
      date: input.period === 'daily' ? input.periodKey : '',
      content: input.content,
      sections: input.sections ?? undefined,
      luckyColor: input.luckyColor ?? null,
      luckyNumber: input.luckyNumber ?? null,
      luckyDay: input.luckyDay ?? null,
      isPublished: input.isPublished,
      source: 'manual',
      generatedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'horoscope.create',
    targetType: 'horoscope',
    targetId: row.id,
    summary: `Created ${input.period} horoscope for ${input.sign} (${input.periodKey})`,
    afterState: row,
  });

  return row;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateHoroscope(adminId: string, id: string, input: UpdateHoroscopeInput) {
  const existing = await getHoroscope(id);

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.content !== undefined) data['content'] = input.content;
  if (input.sections !== undefined) data['sections'] = input.sections;
  if (input.luckyColor !== undefined) data['luckyColor'] = input.luckyColor;
  if (input.luckyNumber !== undefined) data['luckyNumber'] = input.luckyNumber;
  if (input.luckyDay !== undefined) data['luckyDay'] = input.luckyDay;
  if (input.isPublished !== undefined) data['isPublished'] = input.isPublished;

  const updated = await prisma.horoscope.update({ where: { id }, data });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'horoscope.update',
    targetType: 'horoscope',
    targetId: id,
    summary: `Updated ${existing.period} horoscope for ${existing.sign} (${existing.periodKey})`,
    beforeState: existing,
    afterState: updated,
  });

  return updated;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteHoroscope(adminId: string, id: string) {
  const existing = await getHoroscope(id);

  await prisma.horoscope.delete({ where: { id } });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'horoscope.delete',
    targetType: 'horoscope',
    targetId: id,
    summary: `Deleted ${existing.period} horoscope for ${existing.sign} (${existing.periodKey})`,
    beforeState: existing,
  });
}

// ── Publish / unpublish ───────────────────────────────────────────────────────

export async function setPublished(adminId: string, id: string, input: SetPublishedInput) {
  const existing = await getHoroscope(id);

  await prisma.horoscope.update({ where: { id }, data: { isPublished: input.isPublished, updatedAt: new Date() } });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: input.isPublished ? 'horoscope.publish' : 'horoscope.unpublish',
    targetType: 'horoscope',
    targetId: id,
    summary: `${input.isPublished ? 'Published' : 'Unpublished'} ${existing.period} horoscope for ${existing.sign}`,
    beforeState: { isPublished: existing.isPublished },
    afterState: { isPublished: input.isPublished },
  });
}

// ── Bulk generate ─────────────────────────────────────────────────────────────

export async function bulkGenerate(adminId: string, input: BulkGenerateInput) {
  const jobId = `horoscope-${input.period}-${input.periodKey}`;

  await horoscopeQueue.add(
    jobId,
    { period: input.period, periodKey: input.periodKey, source: input.source },
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    },
  );

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'horoscope.bulkGenerate',
    summary: `Queued bulk ${input.period} horoscope generation for ${input.periodKey} via ${input.source}`,
    metadata: { period: input.period, periodKey: input.periodKey, source: input.source, jobId },
  });

  return { jobId, queued: true };
}
