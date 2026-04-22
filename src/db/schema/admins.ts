import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('passwordHash'), // nullable — auth is OTP/Google only, no passwords
  name: text('name').notNull(),
  role: text('role').notNull(), // superAdmin | ops | finance | support | content | analyst
  totpSecret: text('totpSecret'),
  totpEnrolled: boolean('totpEnrolled').notNull().default(false),
  phone: text('phone').unique(),
  isActive: boolean('isActive').notNull().default(true),
  lastLoginAt: timestamp('lastLoginAt', { withTimezone: true }),
  // Per-admin permission overrides on top of role defaults.
  customPermissions: text('customPermissions').array(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
