// Extra tables introduced by the admin platform expansion: settings store,
// async export jobs, and cron run history.

import { pgTable, uuid, text, boolean, jsonb, timestamp, integer, bigint, index } from 'drizzle-orm/pg-core';
import { admins } from './admins';

// ── appSettings: typed key-value configuration store ─────────────────────────

export const appSettings = pgTable('appSettings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  category: text('category'),
  // isSensitive means the value is masked in admin UI by default.
  isSensitive: boolean('isSensitive').notNull().default(false),
  updatedBy: uuid('updatedBy').references(() => admins.id),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// ── exportJobs: tracks async CSV/XLSX export requests ────────────────────────

export const exportJobs = pgTable('exportJobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestedBy: uuid('requestedBy').notNull().references(() => admins.id),
  resource: text('resource').notNull(), // customers | astrologers | consultations | ...
  format: text('format').notNull(), // csv | xlsx
  filters: jsonb('filters'),
  status: text('status').notNull(), // queued | processing | completed | failed | expired
  totalRows: integer('totalRows'),
  fileUrl: text('fileUrl'), // S3 pre-signed URL once complete
  fileSizeBytes: bigint('fileSizeBytes', { mode: 'bigint' }),
  errorMessage: text('errorMessage'),
  expiresAt: timestamp('expiresAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completedAt', { withTimezone: true }),
});

// ── cronRuns: cron job execution history for admin visibility ─────────────────

export const cronRuns = pgTable('cronRuns', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: text('jobName').notNull(),
  status: text('status').notNull(), // running | succeeded | failed
  startedAt: timestamp('startedAt', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finishedAt', { withTimezone: true }),
  durationMs: integer('durationMs'),
  errorMessage: text('errorMessage'),
  traceId: text('traceId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  jobNameStartedAtIdx: index('idx_cronRuns_jobName_startedAt').on(t.jobName, t.startedAt),
}));

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type ExportJob = typeof exportJobs.$inferSelect;
export type NewExportJob = typeof exportJobs.$inferInsert;
export type CronRun = typeof cronRuns.$inferSelect;
export type NewCronRun = typeof cronRuns.$inferInsert;
