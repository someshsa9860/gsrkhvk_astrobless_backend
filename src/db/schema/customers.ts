import { pgTable, uuid, text, boolean, date, time, numeric, timestamp } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique(),
  email: text('email').unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  name: text('name'),
  gender: text('gender'),
  dob: date('dob'),
  birthTime: time('birthTime'),
  birthPlace: text('birthPlace'),
  birthLat: numeric('birthLat', { precision: 9, scale: 6 }),
  birthLng: numeric('birthLng', { precision: 9, scale: 6 }),
  profileImageUrl: text('profileImageUrl'),
  referralCode: text('referralCode').unique(),
  referredBy: uuid('referredBy'),
  isBlocked: boolean('isBlocked').notNull().default(false),
  blockedReason: text('blockedReason'),
  registrationCity: text('registrationCity'),
  registrationState: text('registrationState'),
  registrationCountry: text('registrationCountry'),
  registrationCountryCode: text('registrationCountryCode'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const customerAuthIdentities = pgTable('customerAuthIdentities', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customerId').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  providerKey: text('providerKey').notNull(), // phoneOtp | emailPassword | google | apple
  providerUserId: text('providerUserId').notNull(),
  passwordHash: text('passwordHash'),
  lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type CustomerAuthIdentity = typeof customerAuthIdentities.$inferSelect;
export type NewCustomerAuthIdentity = typeof customerAuthIdentities.$inferInsert;
