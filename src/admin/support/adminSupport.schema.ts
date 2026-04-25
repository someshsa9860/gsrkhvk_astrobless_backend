import { z } from 'zod';

export const TicketListQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional(),
  limit:      z.coerce.number().int().min(1).max(100).optional(),
  status:     z.string().optional(),
  category:   z.string().optional(),
  priority:   z.string().optional(),
  assignedTo: z.string().optional(),
  search:     z.string().optional(),
});

export const UpdateTicketSchema = z.object({
  status:   z.enum(['open', 'inProgress', 'waitingOnUser', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z.string().optional(),
});

export const AssignTicketSchema = z.object({
  adminId: z.string().uuid(),
});

export const PostMessageSchema = z.object({
  body:           z.string().min(1),
  attachmentKeys: z.array(z.string()).optional(),
  isInternalNote: z.boolean().optional(),
});

export const ResolveTicketSchema = z.object({
  resolutionNote: z.string().optional(),
});

export type TicketListQuery  = z.infer<typeof TicketListQuerySchema>;
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;
export type AssignTicketInput = z.infer<typeof AssignTicketSchema>;
export type PostMessageInput  = z.infer<typeof PostMessageSchema>;
export type ResolveTicketInput = z.infer<typeof ResolveTicketSchema>;
