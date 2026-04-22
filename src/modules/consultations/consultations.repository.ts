import { eq, and, desc, sql } from 'drizzle-orm';
import { db, type DbTransaction } from '../../db/client.js';
import { consultations, messages, reviews, astrologerEarnings } from '../../db/schema/consultations.js';
import type { Consultation, NewConsultation, Message, NewMessage } from '../../db/schema/consultations.js';

export async function create(data: NewConsultation, tx?: DbTransaction): Promise<Consultation> {
  const client = tx ?? db;
  const [row] = await (client as typeof db).insert(consultations).values(data).returning();
  return row!;
}

export async function findById(id: string): Promise<Consultation | undefined> {
  return db.query.consultations.findFirst({ where: eq(consultations.id, id) });
}

export async function updateStatus(id: string, data: Partial<typeof consultations.$inferInsert>, tx?: DbTransaction): Promise<void> {
  const client = tx ?? db;
  await (client as typeof db).update(consultations).set(data).where(eq(consultations.id, id));
}

export async function listForCustomer(customerId: string, page: number, limit: number): Promise<{ items: Consultation[]; total: number }> {
  const offset = (page - 1) * limit;
  const [items, countResult] = await Promise.all([
    db.query.consultations.findMany({ where: eq(consultations.customerId, customerId), limit, offset, orderBy: [desc(consultations.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(consultations).where(eq(consultations.customerId, customerId)),
  ]);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function listForAstrologer(astrologerId: string, page: number, limit: number): Promise<{ items: Consultation[]; total: number }> {
  const offset = (page - 1) * limit;
  const [items, countResult] = await Promise.all([
    db.query.consultations.findMany({ where: eq(consultations.astrologerId, astrologerId), limit, offset, orderBy: [desc(consultations.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(consultations).where(eq(consultations.astrologerId, astrologerId)),
  ]);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function insertMessage(data: NewMessage, tx?: DbTransaction): Promise<Message> {
  const client = tx ?? db;
  const [row] = await (client as typeof db).insert(messages).values(data).returning();
  return row!;
}

export async function listMessages(consultationId: string, afterId?: string, limit = 50): Promise<Message[]> {
  return db.query.messages.findMany({
    where: eq(messages.consultationId, consultationId),
    limit,
    orderBy: [desc(messages.createdAt)],
  });
}

export async function insertReview(data: typeof reviews.$inferInsert): Promise<void> {
  await db.insert(reviews).values(data);
}

export async function insertEarning(data: typeof astrologerEarnings.$inferInsert, tx?: DbTransaction): Promise<void> {
  const client = tx ?? db;
  await (client as typeof db).insert(astrologerEarnings).values(data);
}
