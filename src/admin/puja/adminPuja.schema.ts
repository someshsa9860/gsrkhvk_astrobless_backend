import { z } from 'zod';

// ── PujaTemplate ──────────────────────────────────────────────────────────────

export const TemplateListQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  search:   z.string().optional(),
});

export const CreateTemplateSchema = z.object({
  slug:            z.string().min(1).regex(/^[a-z0-9-]+$/),
  title:           z.string().min(1),
  subtitle:        z.string().optional(),
  description:     z.string().optional(),
  category:        z.string().optional(),
  deity:           z.string().optional(),
  occasions:       z.array(z.string()).optional(),
  durationMinutes: z.number().int().positive(),
  basePrice:  z.number().positive(),
  imageKey:        z.string().optional(),
  galleryKeys:     z.array(z.string()).optional(),
  videoKey:        z.string().optional(),
  benefits:        z.array(z.string()).optional(),
  rituals:         z.record(z.unknown()).optional(),
  samagriIncluded: z.record(z.unknown()).optional(),
  samagriRequired: z.record(z.unknown()).optional(),
  isActive:        z.boolean().optional(),
  sortOrder:       z.number().int().min(0).optional(),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial().omit({ slug: true });

export const CreateTierSchema = z.object({
  name:           z.string().min(1),
  price:     z.number().positive(),
  inclusions:     z.array(z.string()).optional(),
  maxParticipants: z.number().int().positive().optional(),
  sortOrder:      z.number().int().min(0).optional(),
});

// ── PujaSlot ──────────────────────────────────────────────────────────────────

export const SlotListQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).optional(),
  limit:          z.coerce.number().int().min(1).max(100).optional(),
  pujaTemplateId: z.string().optional(),
  status:         z.string().optional(),
  from:           z.string().optional(),
  to:             z.string().optional(),
});

export const CreateSlotSchema = z.object({
  pujaTemplateId: z.string().uuid(),
  astrologerId:   z.string().uuid().optional(),
  scheduledAt:    z.string().datetime(),
  timezone:       z.string().optional(),
  capacity:       z.number().int().positive().optional(),
  isLiveStreamed: z.boolean().optional(),
});

export const UpdateSlotSchema = CreateSlotSchema.partial().omit({ pujaTemplateId: true });

// ── PujaBooking ───────────────────────────────────────────────────────────────

export const BookingListQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).optional(),
  limit:       z.coerce.number().int().min(1).max(100).optional(),
  status:      z.string().optional(),
  customerId:  z.string().optional(),
  astrologerId: z.string().optional(),
  from:        z.string().optional(),
  to:          z.string().optional(),
  search:      z.string().optional(),
});

export const UpdateBookingSchema = z.object({
  astrologerId: z.string().uuid().optional(),
  status:       z.string().optional(),
  recordingKey: z.string().optional(),
  liveStreamLink: z.string().optional(),
});

export const BookingRefundSchema = z.object({
  amount: z.number().positive(),
  reason:      z.string().min(1),
});

export type TemplateListQuery   = z.infer<typeof TemplateListQuerySchema>;
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type CreateTierInput     = z.infer<typeof CreateTierSchema>;
export type SlotListQuery       = z.infer<typeof SlotListQuerySchema>;
export type CreateSlotInput     = z.infer<typeof CreateSlotSchema>;
export type UpdateSlotInput     = z.infer<typeof UpdateSlotSchema>;
export type BookingListQuery    = z.infer<typeof BookingListQuerySchema>;
export type UpdateBookingInput  = z.infer<typeof UpdateBookingSchema>;
export type BookingRefundInput  = z.infer<typeof BookingRefundSchema>;
