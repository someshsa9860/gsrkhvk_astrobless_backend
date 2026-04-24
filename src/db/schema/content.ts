import { pgTable, uuid, text, jsonb, timestamp, boolean, index, numeric, date, time } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { astrologers } from './astrologers';

export const birthCharts = pgTable('birthCharts', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customerId').notNull().references(() => customers.id),
  chartData: jsonb('chartData').notNull(),
  computedAt: timestamp('computedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientType: text('recipientType').notNull(), // customer | astrologer
  recipientId: uuid('recipientId').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  data: jsonb('data'),
  readAt: timestamp('readAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  recipientIdx: index('idx_notifications_recipient').on(t.recipientType, t.recipientId, t.createdAt),
}));

export const fcmTokens = pgTable('fcmTokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerType: text('ownerType').notNull(), // customer | astrologer
  ownerId: uuid('ownerId').notNull(),
  token: text('token').unique().notNull(),
  platform: text('platform').notNull(), // ios | android | web
  lastSeenAt: timestamp('lastSeenAt', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('idx_fcmTokens_owner').on(t.ownerType, t.ownerId),
}));

export const horoscopes = pgTable('horoscopes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sign: text('sign').notNull(),         // aries | taurus | gemini | …
  period: text('period').notNull().default('daily'), // daily | weekly | monthly | yearly
  // periodKey encodes the time range:
  //   daily   → 'YYYY-MM-DD'
  //   weekly  → 'YYYY-WNN'   (ISO week, e.g. '2026-W17')
  //   monthly → 'YYYY-MM'
  //   yearly  → 'YYYY'
  periodKey: text('periodKey').notNull(),
  // Legacy column kept for backward compat (same as periodKey for daily rows)
  date: text('date').notNull().default(''),
  content: text('content').notNull().default(''),
  // Rich sections from Vedic Astro API / AI
  sections: jsonb('sections').$type<{
    general?: string;
    love?: string;
    career?: string;
    health?: string;
    wealth?: string;
  }>(),
  luckyColor: text('luckyColor'),
  luckyNumber: text('luckyNumber'),
  luckyDay: text('luckyDay'),
  // 'manual' | 'ai' | 'vedic_api'
  source: text('source').notNull().default('manual'),
  isPublished: boolean('isPublished').notNull().default(false),
  generatedAt: timestamp('generatedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  signPeriodKeyUniq: index('idx_horoscopes_sign_period_periodKey').on(t.sign, t.period, t.periodKey),
  periodKeyIdx: index('idx_horoscopes_period_periodKey').on(t.period, t.periodKey),
  publishedIdx: index('idx_horoscopes_published').on(t.isPublished, t.period, t.periodKey),
}));

export const kundliProfiles = pgTable('kundliProfiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customerId').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  label: text('label').notNull(), // "Self" | "Spouse" | child name etc.
  birthDate: date('birthDate').notNull(),
  birthTime: time('birthTime'), // HH:MM — null if unknown
  birthPlace: text('birthPlace').notNull(),
  birthLat: numeric('birthLat', { precision: 9, scale: 6 }).notNull(),
  birthLng: numeric('birthLng', { precision: 9, scale: 6 }).notNull(),
  timezoneOffset: numeric('timezoneOffset', { precision: 4, scale: 2 }).notNull().default('5.5'),
  // Cached chart data returned from Vedic Astro API
  chartData: jsonb('chartData'),
  chartComputedAt: timestamp('chartComputedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  customerIdx: index('idx_kundliProfiles_customerId').on(t.customerId),
}));

export type BirthChart = typeof birthCharts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type FcmToken = typeof fcmTokens.$inferSelect;
export type Horoscope = typeof horoscopes.$inferSelect;
export type NewHoroscope = typeof horoscopes.$inferInsert;
export type KundliProfile = typeof kundliProfiles.$inferSelect;
export type NewKundliProfile = typeof kundliProfiles.$inferInsert;
