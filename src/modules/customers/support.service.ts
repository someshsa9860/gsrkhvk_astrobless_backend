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

export async function createTicket(customerId: string, data: z.infer<typeof CreateSupportTicketSchema>) {
  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: {
        ticketNumber: generateTicketNumber(),
        submitterType: 'customer',
        submitterId: customerId,
        category: data.category,
        priority: 'normal',
        subject: data.subject,
        description: data.description,
        attachmentUrls: data.attachmentUrls ?? [],
        linkedConsultationId: data.linkedConsultationId ?? null,
        linkedOrderId: data.linkedOrderId ?? null,
        linkedPaymentOrderId: data.linkedPaymentOrderId ?? null,
        status: 'open',
      },
    });
    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: 'support.ticketCreated',
      targetType: 'supportTicket',
      targetId: t.id,
      summary: `Customer opened ticket: ${data.subject}`,
      metadata: { category: data.category, ticketNumber: t.ticketNumber },
    });
    return t;
  });
  return ticket;
}

export async function listTickets(customerId: string, q: z.infer<typeof ListTicketsQuerySchema>) {
  const limit = q.limit ?? 20;
  const page = q.page ?? 1;
  const skip = (page - 1) * limit;

  const where = {
    submitterType: 'customer',
    submitterId: customerId,
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

export async function getTicket(customerId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, submitterType: 'customer', submitterId: customerId },
    include: { messages: { where: { isInternalNote: false }, orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.', 404);
  return ticket;
}

export async function addMessage(
  customerId: string,
  ticketId: string,
  data: z.infer<typeof AddTicketMessageSchema>,
) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, submitterType: 'customer', submitterId: customerId },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.', 404);
  if (ticket.status === 'closed') throw new AppError('VALIDATION', 'Cannot reply to a closed ticket.', 400);

  return prisma.$transaction(async (tx) => {
    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId,
        authorType: 'customer',
        authorId: customerId,
        body: data.body,
        attachmentUrls: data.attachmentUrls ?? [],
      },
    });
    // Re-open ticket if it was waiting on user
    if (ticket.status === 'waitingOnUser') {
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'inProgress' } });
    }
    return message;
  });
}

export async function closeTicket(customerId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, submitterType: 'customer', submitterId: customerId },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Ticket not found.', 404);
  if (ticket.status === 'closed') throw new AppError('VALIDATION', 'Ticket already closed.', 400);

  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'closed' } });
    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: 'support.ticketClosed',
      targetType: 'supportTicket',
      targetId: ticketId,
      summary: `Customer closed ticket ${ticket.ticketNumber}`,
      beforeState: { status: ticket.status },
      afterState: { status: 'closed' },
    });
  });
}
