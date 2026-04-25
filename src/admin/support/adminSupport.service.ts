import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { TicketListQuery, UpdateTicketInput, AssignTicketInput, PostMessageInput, ResolveTicketInput } from './adminSupport.schema.js';

export async function listTickets(q: TicketListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.status)     where['status']      = q.status;
  if (q.category)   where['category']    = q.category;
  if (q.priority)   where['priority']    = q.priority;
  if (q.assignedTo) where['assignedToId'] = q.assignedTo;
  if (q.search)     where['subject']     = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getTicket(id: string) {
  const row = await prisma.supportTicket.findFirst({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!row) throw new AppError('NOT_FOUND', `Ticket ${id} not found.`, 404);
  return row;
}

export async function updateTicket(actorId: string, id: string, input: UpdateTicketInput) {
  await getTicket(id);
  const row = await prisma.supportTicket.update({ where: { id }, data: input });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'support.ticketUpdate', targetType: 'supportTicket', targetId: id, summary: `Updated ticket #${row.ticketNumber}`, afterState: input as Record<string, unknown> });
  return row;
}

export async function assignTicket(actorId: string, id: string, input: AssignTicketInput) {
  const ticket = await getTicket(id);
  const row = await prisma.supportTicket.update({ where: { id }, data: { assignedToId: input.adminId, status: 'inProgress' } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'support.ticketAssign', targetType: 'supportTicket', targetId: id, summary: `Assigned ticket #${ticket.ticketNumber} to admin ${input.adminId}` });
  return row;
}

export async function postMessage(actorId: string, ticketId: string, input: PostMessageInput) {
  await getTicket(ticketId);
  const msg = await prisma.supportTicketMessage.create({
    data: {
      ticketId,
      authorType:     'admin',
      authorId:       actorId,
      body:           input.body,
      attachmentKeys: input.attachmentKeys ?? [],
      isInternalNote: input.isInternalNote ?? false,
    },
  });
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'support.messageSent', targetType: 'supportTicket', targetId: ticketId, summary: `Admin ${input.isInternalNote ? 'added internal note' : 'replied to ticket'}` });
  return msg;
}

export async function resolveTicket(actorId: string, id: string, input: ResolveTicketInput) {
  const ticket = await getTicket(id);
  const row = await prisma.supportTicket.update({
    where: { id },
    data: { status: 'resolved', resolvedAt: new Date(), resolvedById: actorId },
  });
  if (input.resolutionNote) {
    await prisma.supportTicketMessage.create({
      data: { ticketId: id, authorType: 'admin', authorId: actorId, body: input.resolutionNote, isInternalNote: true },
    });
  }
  await writeAuditLog({ actorType: 'admin', actorId, action: 'support.ticketResolve', targetType: 'supportTicket', targetId: id, summary: `Resolved ticket #${ticket.ticketNumber}` });
  return row;
}
