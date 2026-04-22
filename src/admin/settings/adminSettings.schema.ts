// Zod schemas for admin settings (appSettings key-value store).

import { z } from 'zod';

// ── Upsert a setting ──────────────────────────────────────────────────────────

export const UpsertSettingSchema = z.object({
  value: z.unknown().describe('New value for the setting key (any JSON-serialisable value)'),
  description: z.string().optional().describe('Human-readable description of what this setting controls'),
  category: z.string().optional().describe('Grouping category for display in admin UI'),
  reason: z.string().min(3).describe('Mandatory reason for the change (audited)'),
});

export type UpsertSettingInput = z.infer<typeof UpsertSettingSchema>;
