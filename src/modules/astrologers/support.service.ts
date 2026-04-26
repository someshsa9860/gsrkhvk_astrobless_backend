import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { z } from 'zod';
import type { CreateSupportTicketSchema, ListTicketsQuerySchema, AddTicketMessageSchema } from './support.schema.js';

function generateTicketNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `T-${ymd}-${rand}`;
}

export async function createTicket(astrologerId: string, data: z.infer<typeof CreateSupportTicketSchema>) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: {
        ticketNumber: generateTicketNumber(),
        submitterType: 'astrologer',
        submitterId: astrologerId,
        category: data.category,
        priority: 'normal',
        subject: data.subject,
        description: data.description,
        attachmentKeys: data.attachmentKeys ?? [],
        linkedConsultationId: data.linkedConsultationId ?? null,
        status: 'open',
      },
    });
    await writeAuditLog({
      actorType: 'astrologer',
      actorId: astrologerId,
      action: 'support.ticketCreated',
      targetType: 'supportTicket',
      targetId: ticket.id,
      summary: `Astrologer opened ticket: ${data.subject}`,
      metadata: { category: data.category, ticketNumber: ticket.ticketNumber },
    });
    return ticket;
  });
}

export async function listTickets(astrologerId: string, q: z.infer<typeof ListTicketsQuerySchema>) {
  const limit = q.limit ?? 20;
  const page = q.page ?? 1;
  const skip = (page - 1) * limit;

  const where = {
    submitterType: 'astrologer',
    submitterId: astrologerId,
    ...(q.status ? { status: q.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getTicket(astrologerId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, submitterType: 'astrologer', submitterId: astrologerId },
    include: { messages: { where: { isInternalNote: false }, orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.', 404);
  return ticket;
}

export async function addMessage(
  astrologerId: string,
  ticketId: string,
  data: z.infer<typeof AddTicketMessageSchema>,
) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, submitterType: 'astrologer', submitterId: astrologerId },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.', 404);
  if (ticket.status === 'closed') throw new AppError('VALIDATION', 'Cannot reply to a closed ticket.', 400);

  return prisma.$transaction(async (tx) => {
    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId,
        authorType: 'astrologer',
        authorId: astrologerId,
        body: data.body,
        attachmentKeys: data.attachmentKeys ?? [],
      },
    });
    if (ticket.status === 'waitingOnUser') {
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'inProgress' } });
    }
    return message;
  });
}

export async function closeTicket(astrologerId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, submitterType: 'astrologer', submitterId: astrologerId },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.', 404);
  if (ticket.status === 'closed') throw new AppError('VALIDATION', 'Ticket already closed.', 400);

  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'closed' } });
    await writeAuditLog({
      actorType: 'astrologer',
      actorId: astrologerId,
      action: 'support.ticketClosed',
      targetType: 'supportTicket',
      targetId: ticketId,
      summary: `Astrologer closed ticket ${ticket.ticketNumber}`,
      beforeState: { status: ticket.status },
      afterState: { status: 'closed' },
    });
  });
}
