import { z } from 'zod';

export const BannerListQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional(),
  limit:     z.coerce.number().int().min(1).max(100).optional(),
  placement: z.string().optional(),
  isActive:  z.coerce.boolean().optional(),
  search:    z.string().optional(),
});

export const CreateBannerSchema = z.object({
  title:     z.string().min(1),
  imageKey:  z.string().min(1),
  ctaType:   z.enum(['astrologerProfile', 'pujaTemplate', 'product', 'externalUrl', 'category', 'horoscope']),
  ctaTarget: z.string().min(1),
  placement: z.enum(['home', 'astrologerListTop', 'walletScreen', 'pujaList']),
  startsAt:  z.string().datetime(),
  endsAt:    z.string().datetime(),
  priority:  z.number().int().optional(),
  isActive:  z.boolean().optional(),
  audience:  z.record(z.unknown()).optional(),
});

export const UpdateBannerSchema = CreateBannerSchema.partial();

export type BannerListQuery  = z.infer<typeof BannerListQuerySchema>;
export type CreateBannerInput = z.infer<typeof CreateBannerSchema>;
export type UpdateBannerInput = z.infer<typeof UpdateBannerSchema>;
