import { prisma } from '../../db/client.js';
import type { Astrologer, Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { SearchAstrologersQuerySchema } from './astrologers.schema.js';

export async function findById(id: string): Promise<Astrologer | null> {
  return prisma.astrologer.findFirst({ where: { id } });
}

export async function update(id: string, data: Prisma.AstrologerUpdateInput): Promise<Astrologer | null> {
  return prisma.astrologer.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
}

export async function setOnlineStatus(id: string, isOnline: boolean): Promise<void> {
  await prisma.astrologer.update({ where: { id }, data: { isOnline, updatedAt: new Date() } });
}

export async function search(params: z.infer<typeof SearchAstrologersQuerySchema>): Promise<{ items: Astrologer[]; total: number }> {
  const where: Prisma.AstrologerWhereInput = {
    isBlocked: false,
    isVerified: true,
  };

  if (params.isOnline !== undefined) where.isOnline = params.isOnline;
  if (params.minRating) where.ratingAvg = { gte: String(params.minRating) };
  if (params.q) where.displayName = { contains: params.q, mode: 'insensitive' };

  const orderField = params.sort === 'price' ? 'pricePerMinChat'
    : params.sort === 'experience' ? 'experienceYears'
    : params.sort === 'consultations' ? 'totalConsultations'
    : 'ratingAvg';

  const offset = (params.page - 1) * params.limit;

  const [items, total] = await prisma.$transaction([
    prisma.astrologer.findMany({
      where,
      orderBy: { [orderField]: params.order === 'asc' ? 'asc' : 'desc' },
      skip: offset,
      take: params.limit,
    }),
    prisma.astrologer.count({ where }),
  ]);

  return { items, total };
}
