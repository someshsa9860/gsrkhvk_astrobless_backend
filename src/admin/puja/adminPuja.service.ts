import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type {
  TemplateListQuery, CreateTemplateInput, UpdateTemplateInput, CreateTierInput,
  SlotListQuery, CreateSlotInput, UpdateSlotInput,
  BookingListQuery, UpdateBookingInput, BookingRefundInput,
} from './adminPuja.schema.js';

// ── Templates ─────────────────────────────────────────────────────────────────

export async function listTemplates(q: TemplateListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.category)              where['category'] = q.category;
  if (q.isActive !== undefined) where['isActive'] = q.isActive;
  if (q.search)                where['title']    = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.pujaTemplate.findMany({
      where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: offset, take: limit,
      include: { packageTiers: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.pujaTemplate.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getTemplate(id: string) {
  const row = await prisma.pujaTemplate.findFirst({
    where: { id },
    include: { packageTiers: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!row) throw new AppError('NOT_FOUND', `PujaTemplate ${id} not found.`, 404);
  return row;
}

export async function createTemplate(actorId: string, input: CreateTemplateInput) {
  const existing = await prisma.pujaTemplate.findFirst({ where: { slug: input.slug } });
  if (existing) throw new AppError('VALIDATION', `Slug "${input.slug}" already in use.`, 400);
  const row = await prisma.pujaTemplate.create({
    data: {
      ...input,
      occasions:   input.occasions   ?? [],
      galleryKeys: input.galleryKeys ?? [],
      benefits:    input.benefits    ?? [],
      isActive:    input.isActive    ?? true,
      sortOrder:   input.sortOrder   ?? 0,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.templateCreate', targetType: 'pujaTemplate', targetId: row.id, summary: `Created puja template "${row.title}"` });
  return row;
}

export async function updateTemplate(actorId: string, id: string, input: UpdateTemplateInput) {
  await getTemplate(id);
  const row = await prisma.pujaTemplate.update({ where: { id }, data: input });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.templateUpdate', targetType: 'pujaTemplate', targetId: id, summary: `Updated puja template "${row.title}"` });
  return row;
}

export async function deleteTemplate(actorId: string, id: string) {
  const existing = await getTemplate(id);
  await prisma.pujaTemplate.update({ where: { id }, data: { isActive: false } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.templateDelete', targetType: 'pujaTemplate', targetId: id, summary: `Deactivated puja template "${existing.title}"` });
}

export async function createTier(actorId: string, templateId: string, input: CreateTierInput) {
  await getTemplate(templateId);
  const tier = await prisma.pujaPackageTier.create({
    data: {
      pujaTemplateId:  templateId,
      name:            input.name,
      price:           input.price,
      inclusions:      input.inclusions    ?? [],
      maxParticipants: input.maxParticipants,
      sortOrder:       input.sortOrder     ?? 0,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.tierCreate', targetType: 'pujaPackageTier', targetId: tier.id, summary: `Added tier "${tier.name}" to template ${templateId}` });
  return tier;
}

export async function deleteTier(actorId: string, templateId: string, tierId: string) {
  const tier = await prisma.pujaPackageTier.findFirst({ where: { id: tierId, pujaTemplateId: templateId } });
  if (!tier) throw new AppError('NOT_FOUND', `Tier ${tierId} not found.`, 404);
  await prisma.pujaPackageTier.delete({ where: { id: tierId } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.tierDelete', targetType: 'pujaPackageTier', targetId: tierId, summary: `Deleted tier "${tier.name}"` });
}

// ── Slots ─────────────────────────────────────────────────────────────────────

export async function listSlots(q: SlotListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.pujaTemplateId) where['pujaTemplateId'] = q.pujaTemplateId;
  if (q.status)         where['status']         = q.status;
  if (q.from || q.to) {
    const scheduledAt: Record<string, Date> = {};
    if (q.from) scheduledAt['gte'] = new Date(q.from);
    if (q.to)   scheduledAt['lte'] = new Date(q.to);
    where['scheduledAt'] = scheduledAt;
  }

  const [items, total] = await Promise.all([
    prisma.pujaSlot.findMany({ where, orderBy: { scheduledAt: 'asc' }, skip: offset, take: limit, include: { template: { select: { title: true, slug: true } } } }),
    prisma.pujaSlot.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getSlot(id: string) {
  const row = await prisma.pujaSlot.findFirst({ where: { id }, include: { template: true } });
  if (!row) throw new AppError('NOT_FOUND', `PujaSlot ${id} not found.`, 404);
  return row;
}

export async function createSlot(actorId: string, input: CreateSlotInput) {
  await getTemplate(input.pujaTemplateId);
  const row = await prisma.pujaSlot.create({
    data: {
      pujaTemplateId:  input.pujaTemplateId,
      astrologerId:    input.astrologerId,
      scheduledAt:     new Date(input.scheduledAt),
      timezone:        input.timezone      ?? 'Asia/Kolkata',
      capacity:        input.capacity      ?? 1,
      isLiveStreamed:  input.isLiveStreamed ?? false,
      status:          'open',
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.slotCreate', targetType: 'pujaSlot', targetId: row.id, summary: `Created puja slot for template ${input.pujaTemplateId}` });
  return row;
}

export async function updateSlot(actorId: string, id: string, input: UpdateSlotInput) {
  await getSlot(id);
  const data: Record<string, unknown> = { ...input };
  if (input.scheduledAt) data['scheduledAt'] = new Date(input.scheduledAt);
  const row = await prisma.pujaSlot.update({ where: { id }, data });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.slotUpdate', targetType: 'pujaSlot', targetId: id, summary: `Updated puja slot` });
  return row;
}

export async function cancelSlot(actorId: string, id: string, reason?: string) {
  await getSlot(id);
  await prisma.pujaSlot.update({ where: { id }, data: { status: 'cancelled' } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.slotCancel', targetType: 'pujaSlot', targetId: id, summary: `Cancelled puja slot`, metadata: { reason } });
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export async function listBookings(q: BookingListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.status)       where['status']       = q.status;
  if (q.customerId)   where['customerId']   = q.customerId;
  if (q.astrologerId) where['astrologerId'] = q.astrologerId;
  if (q.from || q.to) {
    const scheduledAt: Record<string, Date> = {};
    if (q.from) scheduledAt['gte'] = new Date(q.from);
    if (q.to)   scheduledAt['lte'] = new Date(q.to);
    where['scheduledAt'] = scheduledAt;
  }
  if (q.search) where['devoteeName'] = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.pujaBooking.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit, include: { template: { select: { title: true, slug: true } } } }),
    prisma.pujaBooking.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getBooking(id: string) {
  const row = await prisma.pujaBooking.findFirst({ where: { id }, include: { template: true, packageTier: true, slot: true } });
  if (!row) throw new AppError('NOT_FOUND', `PujaBooking ${id} not found.`, 404);
  return row;
}

export async function updateBooking(actorId: string, id: string, input: UpdateBookingInput) {
  await getBooking(id);
  const row = await prisma.pujaBooking.update({ where: { id }, data: input });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.bookingUpdate', targetType: 'pujaBooking', targetId: id, summary: `Updated puja booking #${row.bookingNumber}`, afterState: input as Record<string, unknown> });
  return row;
}

export async function refundBooking(actorId: string, id: string, input: BookingRefundInput) {
  const booking = await getBooking(id);
  await prisma.pujaBooking.update({ where: { id }, data: { status: 'refunded' } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'puja.bookingRefund', targetType: 'pujaBooking', targetId: id, summary: `Refunded puja booking #${booking.bookingNumber} — ₹${input.amount} — ${input.reason}`, metadata: { amount: input.amount, reason: input.reason } });
}
