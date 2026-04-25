import { z } from 'zod';

export const ArticleListQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).optional(),
  limit:       z.coerce.number().int().min(1).max(100).optional(),
  category:    z.string().optional(),
  isPublished: z.coerce.boolean().optional(),
  language:    z.string().optional(),
  search:      z.string().optional(),
});

export const CreateArticleSchema = z.object({
  slug:          z.string().min(1).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  title:         z.string().min(1),
  subtitle:      z.string().optional(),
  coverImageKey: z.string().optional(),
  body:          z.string().min(1),
  category:      z.string().optional(),
  tags:          z.array(z.string()).optional(),
  language:      z.string().optional(),
  authorName:    z.string().optional(),
  isPublished:   z.boolean().optional(),
  publishedAt:   z.string().datetime().optional(),
});

export const UpdateArticleSchema = CreateArticleSchema.partial().omit({ slug: true });

export type ArticleListQuery  = z.infer<typeof ArticleListQuerySchema>;
export type CreateArticleInput = z.infer<typeof CreateArticleSchema>;
export type UpdateArticleInput = z.infer<typeof UpdateArticleSchema>;
