import { z } from 'zod';

export const UpdateAstrologerProfileSchema = z.object({
  displayName: z.string().min(1).optional(),
  bio: z.string().optional(),
  profileImageUrl: z.string().url().optional(),
  languages: z.array(z.string()).optional(),
  specialties: z.array(z.string()).optional(),
  experienceYears: z.number().int().min(0).optional(),
  pricePerMinChatPaise: z.number().int().min(100).optional(),
  pricePerMinCallPaise: z.number().int().min(100).optional(),
  pricePerMinVideoPaise: z.number().int().min(100).optional(),
});

export const SearchAstrologersQuerySchema = z.object({
  q: z.string().optional().describe('Search query — name, specialty, language'),
  specialty: z.string().optional(),
  language: z.string().optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  maxPricePerMinPaise: z.coerce.number().optional(),
  isOnline: z.coerce.boolean().optional(),
  sort: z.enum(['rating', 'price', 'experience', 'consultations']).default('rating'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const SetOnlineStatusSchema = z.object({
  isOnline: z.boolean(),
});
