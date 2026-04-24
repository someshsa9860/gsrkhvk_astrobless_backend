import { z } from 'zod';

export const CreateKundliProfileSchema = z.object({
  label:           z.string().min(1).max(60).describe('Who this chart belongs to — "Self", "Spouse", child name, etc.'),
  birthDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').describe('Birth date in YYYY-MM-DD'),
  birthTime:       z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM').optional().describe('Birth time HH:MM (24h). Omit if unknown.'),
  birthPlace:      z.string().min(1).max(200).describe('City/place name shown to user'),
  birthLat:        z.number().min(-90).max(90).describe('Latitude of birth place'),
  birthLng:        z.number().min(-180).max(180).describe('Longitude of birth place'),
  timezoneOffset:  z.number().min(-12).max(14).default(5.5).describe('Timezone offset from UTC, e.g. 5.5 for IST'),
});

export const KundliProfileResponseSchema = z.object({
  id:              z.string().uuid(),
  customerId:      z.string().uuid(),
  label:           z.string(),
  birthDate:       z.string(),
  birthTime:       z.string().nullable(),
  birthPlace:      z.string(),
  birthLat:        z.string(),
  birthLng:        z.string(),
  timezoneOffset:  z.string(),
  chartComputedAt: z.string().nullable(),
  createdAt:       z.string(),
  updatedAt:       z.string(),
});
