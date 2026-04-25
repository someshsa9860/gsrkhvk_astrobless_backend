import { prisma, type PrismaTransaction } from '../../db/client.js';
import type { Consultation, Message, Prisma } from '@prisma/client';

export async function create(data: Prisma.ConsultationCreateInput, tx?: PrismaTransaction): Promise<Consultation> {
  const client = tx ?? prisma;
  return client.consultation.create({ data });
}

export async function findById(id: string): Promise<Consultation | null> {
  return prisma.consultation.findFirst({ where: { id } });
}

export async function updateStatus(id: string, data: Prisma.ConsultationUpdateInput, tx?: PrismaTransaction): Promise<void> {
  const client = tx ?? prisma;
  await client.consultation.update({ where: { id }, data });
}

export async function listForCustomer(customerId: string, page: number, limit: number): Promise<{ items: Consultation[]; total: number }> {
  const offset = (page - 1) * limit;
  const [items, total] = await prisma.$transaction([
    prisma.consultation.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
    prisma.consultation.count({ where: { customerId } }),
  ]);
  return { items, total };
}

export async function listForAstrologer(astrologerId: string, page: number, limit: number): Promise<{ items: Consultation[]; total: number }> {
  const offset = (page - 1) * limit;
  const [items, total] = await prisma.$transaction([
    prisma.consultation.findMany({ where: { astrologerId }, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
    prisma.consultation.count({ where: { astrologerId } }),
  ]);
  return { items, total };
}

export async function insertMessage(data: Prisma.MessageCreateInput, tx?: PrismaTransaction): Promise<Message> {
  const client = tx ?? prisma;
  return client.message.create({ data });
}

export async function listMessages(consultationId: string, _afterId?: string, limit = 50): Promise<Message[]> {
  return prisma.message.findMany({
    where: { consultationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function insertReview(data: Prisma.ReviewCreateInput): Promise<void> {
  await prisma.review.create({ data });
}

export async function insertEarning(data: Prisma.AstrologerEarningCreateInput, tx?: PrismaTransaction): Promise<void> {
  const client = tx ?? prisma;
  await client.astrologerEarning.create({ data });
}
