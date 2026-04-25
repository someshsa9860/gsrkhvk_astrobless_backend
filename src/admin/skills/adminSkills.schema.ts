import { z } from 'zod';

export const SkillListQuerySchema = z.object({
  search:   z.string().optional(),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(200).optional(),
});

export const CreateSkillSchema = z.object({
  slug:        z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, hyphens only'),
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category:    z.string().max(100).optional(),
  isActive:    z.boolean().optional(),
  sortOrder:   z.number().int().min(0).optional(),
});

export const UpdateSkillSchema = CreateSkillSchema.partial();

export type SkillListQuery   = z.infer<typeof SkillListQuerySchema>;
export type CreateSkillInput = z.infer<typeof CreateSkillSchema>;
export type UpdateSkillInput = z.infer<typeof UpdateSkillSchema>;
