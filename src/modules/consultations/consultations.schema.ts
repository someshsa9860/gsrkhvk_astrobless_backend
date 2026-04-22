import { z } from 'zod';

export const RequestConsultationSchema = z.object({
  astrologerId: z.string().uuid(),
  type: z.enum(['chat', 'voice', 'video']),
});

export const EndConsultationSchema = z.object({
  reason: z.enum(['userEnded', 'astrologerEnded', 'lowBalance', 'timeout', 'error']).optional().default('userEnded'),
});

export const SubmitReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const ConsultationQuerySchema = z.object({
  status: z.enum(['requested', 'accepted', 'active', 'ended', 'rejected', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
