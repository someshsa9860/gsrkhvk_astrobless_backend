import { eq, and, gte, lte, ilike, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { astrologers } from '../../db/schema/astrologers.js';
import type { Astrologer } from '../../db/schema/astrologers.js';
import type { z } from 'zod';
import type { SearchAstrologersQuerySchema } from './astrologers.schema.js';

export async function findById(id: string): Promise<Astrologer | undefined> {
  return db.query.astrologers.findFirst({ where: eq(astrologers.id, id) });
}

export async function update(id: string, data: Partial<typeof astrologers.$inferInsert>): Promise<Astrologer | undefined> {
  const [updated] = await db.update(astrologers).set({ ...data, updatedAt: new Date() }).where(eq(astrologers.id, id)).returning();
  return updated;
}

export async function setOnlineStatus(id: string, isOnline: boolean): Promise<void> {
  await db.update(astrologers).set({ isOnline, updatedAt: new Date() }).where(eq(astrologers.id, id));
}

export async function search(params: z.infer<typeof SearchAstrologersQuerySchema>): Promise<{ items: Astrologer[]; total: number }> {
  const conditions = [
    eq(astrologers.isBlocked, false),
    eq(astrologers.isVerified, true),
  ];

  if (params.isOnline !== undefined) conditions.push(eq(astrologers.isOnline, params.isOnline));
  if (params.minRating) conditions.push(gte(astrologers.ratingAvg, String(params.minRating)));
  if (params.q) conditions.push(ilike(astrologers.displayName, `%${params.q}%`));

  const orderCol = params.sort === 'price' ? astrologers.pricePerMinChat
    : params.sort === 'experience' ? astrologers.experienceYears
    : params.sort === 'consultations' ? astrologers.totalConsultations
    : astrologers.ratingAvg;

  const offset = (params.page - 1) * params.limit;

  const [items, countResult] = await Promise.all([
    db.query.astrologers.findMany({
      where: and(...conditions),
      limit: params.limit,
      offset,
      orderBy: params.order === 'asc' ? [sql`${orderCol} asc`] : [sql`${orderCol} desc`],
    }),
    db.select({ count: sql<number>`count(*)` }).from(astrologers).where(and(...conditions)),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}
