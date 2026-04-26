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
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const sort = params.sort ?? 'rating';
  const order = params.order ?? 'desc';
  const searchText = params.q ?? params.search;

  const where: Prisma.AstrologerWhereInput = {
    isBlocked: false,
    isVerified: true,
  };

  if (params.isOnline !== undefined) where.isOnline = params.isOnline;
  if (params.minRating) where.ratingAvg = { gte: String(params.minRating) };
  if (searchText) where.displayName = { contains: searchText, mode: 'insensitive' };
  if (params.specialty) where.specialties = { has: params.specialty };
  if (params.language) where.languages = { has: params.language };

  const orderField = sort === 'price' ? 'pricePerMinChat'
    : sort === 'experience' ? 'experienceYears'
    : sort === 'consultations' ? 'totalConsultations'
    : 'ratingAvg';

  const offset = (page - 1) * limit;

  const [items, total] = await prisma.$transaction([
    prisma.astrologer.findMany({
      where,
      orderBy: { [orderField]: order === 'asc' ? 'asc' : 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.astrologer.count({ where }),
  ]);

  return { items, total };
}
