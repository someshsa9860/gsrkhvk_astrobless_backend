import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type {
  CreateRechargePackInput, UpdateRechargePackInput,
  CouponListQuery, CreateCouponInput, UpdateCouponInput,
} from './adminPromotions.schema.js';

// ── Recharge Packs ────────────────────────────────────────────────────────────

export async function listRechargePacks() {
  return prisma.rechargePack.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
}

export async function getRechargePack(id: string) {
  const row = await prisma.rechargePack.findFirst({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', `RechargePack ${id} not found.`, 404);
  return row;
}

export async function createRechargePack(actorId: string, input: CreateRechargePackInput) {
  const row = await prisma.rechargePack.create({
    data: {
      label:    input.label ?? '',
      amount:   input.amount,
      bonus:    input.bonus ?? 0,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'rechargePack.create', targetType: 'rechargePack', targetId: row.id, summary: `Created recharge pack "${row.label}"` });
  return row;
}

export async function updateRechargePack(actorId: string, id: string, input: UpdateRechargePackInput) {
  const existing = await prisma.rechargePack.findFirst({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', `RechargePack ${id} not found.`, 404);
  const row = await prisma.rechargePack.update({ where: { id }, data: input });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'rechargePack.update', targetType: 'rechargePack', targetId: id, summary: `Updated recharge pack "${existing.label}"` });
  return row;
}

export async function deleteRechargePack(actorId: string, id: string) {
  const existing = await getRechargePack(id);
  await prisma.rechargePack.delete({ where: { id } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'rechargePack.delete', targetType: 'rechargePack', targetId: id, summary: `Deleted recharge pack "${existing.label}"` });
}

// ── Coupons ───────────────────────────────────────────────────────────────────

export async function listCoupons(q: CouponListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.isActive !== undefined) where['isActive'] = q.isActive;
  if (q.search)  where['code'] = { contains: q.search.toUpperCase(), mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
    prisma.coupon.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getCoupon(id: string) {
  const row = await prisma.coupon.findFirst({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', `Coupon ${id} not found.`, 404);
  return row;
}

export async function createCoupon(actorId: string, input: CreateCouponInput) {
  const existing = await prisma.coupon.findFirst({ where: { code: input.code } });
  if (existing) throw new AppError('VALIDATION', `Coupon code "${input.code}" already exists.`, 400);

  const row = await prisma.coupon.create({
    data: {
      code:         input.code,
      type:         input.type,
      value:        input.value,
      valuePercent: input.valuePercent,
      maxDiscount:  input.maxDiscount,
      minAmount:    input.minAmount,
      validFrom:    new Date(input.validFrom),
      validTo:      new Date(input.validTo),
      usageLimit:   input.usageLimit,
      perCustomerLimit: input.perCustomerLimit ?? 1,
      isActive:     input.isActive ?? true,
      description:  input.description,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'coupon.create', targetType: 'coupon', targetId: row.id, summary: `Created coupon "${row.code}"` });
  return row;
}

export async function updateCoupon(actorId: string, id: string, input: UpdateCouponInput) {
  const coupon = await prisma.coupon.findFirst({ where: { id } });
  if (!coupon) throw new AppError('NOT_FOUND', `Coupon ${id} not found.`, 404);
  const data: Record<string, unknown> = { ...input };
  if (input.validFrom) data['validFrom'] = new Date(input.validFrom);
  if (input.validTo)   data['validTo']   = new Date(input.validTo);
  const row = await prisma.coupon.update({ where: { id }, data });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'coupon.update', targetType: 'coupon', targetId: id, summary: `Updated coupon "${coupon.code}"` });
  return row;
}

export async function deleteCoupon(actorId: string, id: string) {
  const coupon = await prisma.coupon.findFirst({ where: { id } });
  if (!coupon) throw new AppError('NOT_FOUND', `Coupon ${id} not found.`, 404);
  await prisma.coupon.delete({ where: { id } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'coupon.delete', targetType: 'coupon', targetId: id, summary: `Deleted coupon "${coupon.code}"` });
}
