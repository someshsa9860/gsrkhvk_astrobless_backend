import { z } from 'zod';

export const LanguageListQuerySchema = z.object({
  search:   z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(200).optional(),
});

export const CreateLanguageSchema = z.object({
  code:       z.string().min(2).max(10),
  name:       z.string().min(1).max(100),
  nativeName: z.string().max(100).optional(),
  isActive:   z.boolean().optional(),
  sortOrder:  z.number().int().min(0).optional(),
});

export const UpdateLanguageSchema = CreateLanguageSchema.partial();

export type LanguageListQuery  = z.infer<typeof LanguageListQuerySchema>;
export type CreateLanguageInput = z.infer<typeof CreateLanguageSchema>;
export type UpdateLanguageInput = z.infer<typeof UpdateLanguageSchema>;
