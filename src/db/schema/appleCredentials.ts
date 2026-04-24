import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const appleCredentials = pgTable('appleCredentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  appleId: text('appleId').unique().notNull(), // stable Apple sub, never changes
  email: text('email'),
  name: text('name'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export type AppleCredential = typeof appleCredentials.$inferSelect;
export type NewAppleCredential = typeof appleCredentials.$inferInsert;
