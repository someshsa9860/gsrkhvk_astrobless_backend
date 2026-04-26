import { z } from 'zod';

export const CreateSupportTicketSchema = z.object({
  category: z.enum(['payment', 'consultation', 'kyc', 'puja', 'order', 'general']),
  subject: z.string().min(5).max(200),
  description: z.string().min(10).max(2000),
  attachmentKeys: z.array(z.string()).max(5).optional(),
  linkedConsultationId: z.string().uuid().optional(),
});

export const ListTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  status: z.enum(['open', 'inProgress', 'waitingOnUser', 'resolved', 'closed']).optional(),
});

export const AddTicketMessageSchema = z.object({
  body: z.string().min(1).max(5000),
  attachmentKeys: z.array(z.string()).max(5).optional(),
});
