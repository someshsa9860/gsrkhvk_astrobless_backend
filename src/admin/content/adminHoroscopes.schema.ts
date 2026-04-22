import { z } from 'zod';

const SIGNS = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'] as const;
const PERIODS = ['daily','weekly','monthly','yearly'] as const;

// ── List query ────────────────────────────────────────────────────────────────

export const HoroscopeListQuerySchema = z.object({
  sign:        z.enum(SIGNS).optional().describe('Filter by zodiac sign'),
  period:      z.enum(PERIODS).optional().describe('Filter by period type'),
  periodKey:   z.string().optional().describe('Exact period key (e.g. 2026-04-21)'),
  isPublished: z.coerce.boolean().optional().describe('Filter by published state'),
  from:        z.string().optional().describe('ISO date — createdAt >='),
  to:          z.string().optional().describe('ISO date — createdAt <='),
  page:        z.coerce.number().int().min(1).optional().describe('1-based page number (default: 1)'),
  limit:       z.coerce.number().int().min(1).max(100).optional().describe('Results per page (max 100, default: 20)'),
});

export type HoroscopeListQuery = z.infer<typeof HoroscopeListQuerySchema>;

// ── Create / update ───────────────────────────────────────────────────────────

const SectionsSchema = z.object({
  general: z.string().optional(),
  love:    z.string().optional(),
  career:  z.string().optional(),
  health:  z.string().optional(),
  wealth:  z.string().optional(),
}).describe('Rich Vedic sections');

export const CreateHoroscopeSchema = z.object({
  sign:        z.enum(SIGNS).describe('Zodiac sign'),
  period:      z.enum(PERIODS).describe('Period type'),
  periodKey:   z.string().min(1).describe('Period key string (YYYY-MM-DD, YYYY-WNN, YYYY-MM, YYYY)'),
  content:     z.string().default('').describe('Plain-text summary (legacy + fallback)'),
  sections:    SectionsSchema.optional(),
  luckyColor:  z.string().optional(),
  luckyNumber: z.string().optional(),
  luckyDay:    z.string().optional(),
  isPublished: z.boolean().default(false),
});

export const UpdateHoroscopeSchema = CreateHoroscopeSchema.partial().omit({ sign: true, period: true, periodKey: true });

export type CreateHoroscopeInput = z.infer<typeof CreateHoroscopeSchema>;
export type UpdateHoroscopeInput = z.infer<typeof UpdateHoroscopeSchema>;

// ── Bulk generate ─────────────────────────────────────────────────────────────

export const BulkGenerateSchema = z.object({
  period:    z.enum(PERIODS).describe('Which period to generate for'),
  periodKey: z.string().min(1).describe('Target period key'),
  source:    z.enum(['vedic_api', 'ai']).default('vedic_api').describe('Generation source'),
});

export type BulkGenerateInput = z.infer<typeof BulkGenerateSchema>;

// ── Publish state toggle ──────────────────────────────────────────────────────

export const SetPublishedSchema = z.object({
  isPublished: z.boolean(),
});

export type SetPublishedInput = z.infer<typeof SetPublishedSchema>;
