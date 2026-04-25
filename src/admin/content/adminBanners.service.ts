import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { BannerListQuery, CreateBannerInput, UpdateBannerInput } from './adminBanners.schema.js';

export async function listBanners(q: BannerListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.placement)          where['placement'] = q.placement;
  if (q.isActive !== undefined) where['isActive'] = q.isActive;
  if (q.search) where['title'] = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.banner.findMany({ where, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], skip: offset, take: limit }),
    prisma.banner.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getBanner(id: string) {
  const row = await prisma.banner.findFirst({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', `Banner ${id} not found.`, 404);
  return row;
}

export async function createBanner(actorId: string, input: CreateBannerInput) {
  const row = await prisma.banner.create({
    data: {
      ...input,
      startsAt:  new Date(input.startsAt),
      endsAt:    new Date(input.endsAt),
      priority:  input.priority ?? 0,
      isActive:  input.isActive ?? true,
      createdBy: actorId,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'banner.create', targetType: 'banner', targetId: row.id, summary: `Created banner "${row.title}"` });
  return row;
}

export async function updateBanner(actorId: string, id: string, input: UpdateBannerInput) {
  const existing = await getBanner(id);
  const data: Record<string, unknown> = { ...input };
  if (input.startsAt) data['startsAt'] = new Date(input.startsAt);
  if (input.endsAt)   data['endsAt']   = new Date(input.endsAt);
  const row = await prisma.banner.update({ where: { id }, data });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'banner.update', targetType: 'banner', targetId: id, summary: `Updated banner "${existing.title}"`, beforeState: existing as Record<string, unknown> });
  return row;
}

export async function deleteBanner(actorId: string, id: string) {
  const existing = await getBanner(id);
  await prisma.banner.delete({ where: { id } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'banner.delete', targetType: 'banner', targetId: id, summary: `Deleted banner "${existing.title}"` });
}
