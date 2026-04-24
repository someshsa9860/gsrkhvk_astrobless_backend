import { pgTable, uuid, text, integer, doublePrecision, numeric, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { astrologers } from './astrologers';

export const consultations = pgTable('consultations', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customerId').notNull().references(() => customers.id),
  astrologerId: uuid('astrologerId').notNull().references(() => astrologers.id),
  type: text('type').notNull(), // chat | voice | video
  status: text('status').notNull(), // requested | accepted | active | ended | rejected | cancelled
  pricePerMin: doublePrecision('pricePerMin').notNull(),
  commissionPct: numeric('commissionPct', { precision: 5, scale: 2 }).notNull(),
  requestedAt: timestamp('requestedAt', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('acceptedAt', { withTimezone: true }),
  startedAt: timestamp('startedAt', { withTimezone: true }),
  endedAt: timestamp('endedAt', { withTimezone: true }),
  durationSeconds: integer('durationSeconds').notNull().default(0),
  totalCharged: doublePrecision('totalCharged').notNull().default(0),
  astrologerEarning: doublePrecision('astrologerEarning').notNull().default(0),
  platformEarning: doublePrecision('platformEarning').notNull().default(0),
  endReason: text('endReason'), // userEnded | astrologerEnded | lowBalance | timeout | error
  agoraChannelName: text('agoraChannelName'),
  traceId: text('traceId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  customerIdx: index('idx_consultations_customerId').on(t.customerId),
  astrologerIdx: index('idx_consultations_astrologerId').on(t.astrologerId),
  statusIdx: index('idx_consultations_status').on(t.status),
}));

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  consultationId: uuid('consultationId').notNull().references(() => consultations.id, { onDelete: 'cascade' }),
  senderType: text('senderType').notNull(), // customer | astrologer | system
  senderId: uuid('senderId'),
  type: text('type').notNull(), // text | image | audio | system
  body: text('body'),
  mediaUrl: text('mediaUrl'),
  clientMsgId: text('clientMsgId'),
  isFlagged: boolean('isFlagged').notNull().default(false),
  readAt: timestamp('readAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  consultationCreatedAtIdx: index('idx_messages_consultationId_createdAt').on(t.consultationId, t.createdAt),
}));

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  consultationId: uuid('consultationId').unique().notNull().references(() => consultations.id),
  customerId: uuid('customerId').notNull().references(() => customers.id),
  astrologerId: uuid('astrologerId').notNull().references(() => astrologers.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  isHidden: boolean('isHidden').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const astrologerEarnings = pgTable('astrologerEarnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  astrologerId: uuid('astrologerId').notNull().references(() => astrologers.id),
  consultationId: uuid('consultationId').notNull().references(() => consultations.id),
  gross: bigint('gross', { mode: 'bigint' }).notNull(),
  commissionPct: numeric('commissionPct', { precision: 5, scale: 2 }).notNull(),
  commission: bigint('commission', { mode: 'bigint' }).notNull(),
  net: bigint('net', { mode: 'bigint' }).notNull(),
  settledPayoutId: uuid('settledPayoutId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  astrologerId: uuid('astrologerId').notNull().references(() => astrologers.id),
  providerKey: text('providerKey').notNull(),
  providerPayoutId: text('providerPayoutId'),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
  status: text('status').notNull(), // queued | processing | processed | failed
  periodStart: timestamp('periodStart', { withTimezone: true }).notNull(),
  periodEnd: timestamp('periodEnd', { withTimezone: true }).notNull(),
  idempotencyKey: text('idempotencyKey').unique().notNull(),
  failureReason: text('failureReason'),
  processedAt: timestamp('processedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export type Consultation = typeof consultations.$inferSelect;
export type NewConsultation = typeof consultations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type AstrologerEarning = typeof astrologerEarnings.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
