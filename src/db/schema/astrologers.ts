import { pgTable, uuid, text, boolean, integer, numeric, bigint, jsonb, timestamp } from 'drizzle-orm/pg-core';

// Typed shape stored in astrologers.kycDocsRef (JSONB)
export interface KycDocsRef {
  aadhaarDocUrl?: string;      // S3 signed URL to Aadhaar card image/PDF
  aadhaarBackDocUrl?: string;  // back side if scanned separately
  panDocUrl?: string;          // S3 signed URL to PAN card image
  selfieDocUrl?: string;       // live selfie for identity verification
  certificationDocUrl?: string; // astrology certification / degree
  submittedAt?: string;        // ISO timestamp when astrologer submitted KYC
  reviewNote?: string;         // admin note on approval/rejection
}

// Typed shape stored in astrologers.bankAccountRef (JSONB)
export interface BankAccountRef {
  accountHolderName: string;
  accountNumber: string;       // stored masked in transit (last 4 only shown in UI)
  ifscCode: string;
  bankName: string;
  accountType: 'savings' | 'current';
  branchName?: string;
}

export const astrologers = pgTable('astrologers', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').unique(),
  email: text('email').unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  displayName: text('displayName').notNull(),
  legalName: text('legalName'),
  bio: text('bio'),
  profileImageUrl: text('profileImageUrl'),
  languages: text('languages').array().notNull().default([]),
  specialties: text('specialties').array().notNull().default([]),
  experienceYears: integer('experienceYears').notNull().default(0),
  pricePerMinChatPaise: integer('pricePerMinChatPaise').notNull(),
  pricePerMinCallPaise: integer('pricePerMinCallPaise').notNull(),
  pricePerMinVideoPaise: integer('pricePerMinVideoPaise').notNull(),
  isOnline: boolean('isOnline').notNull().default(false),
  isBusy: boolean('isBusy').notNull().default(false),
  isVerified: boolean('isVerified').notNull().default(false),
  ratingAvg: numeric('ratingAvg', { precision: 3, scale: 2 }).notNull().default('0'),
  ratingCount: integer('ratingCount').notNull().default(0),
  totalConsultations: integer('totalConsultations').notNull().default(0),
  totalEarningsPaise: bigint('totalEarningsPaise', { mode: 'bigint' }).notNull().$defaultFn(() => BigInt(0)),
  kycStatus: text('kycStatus').notNull().default('pending'), // pending | approved | rejected
  // Typed KYC fields — indexed separately for search/filter
  panNumber: text('panNumber'),          // PAN card number (ABCDE1234F format)
  aadhaarLast4: text('aadhaarLast4'),    // Last 4 digits only (never store full Aadhaar)
  upiId: text('upiId'),                  // UPI ID for instant payouts (e.g. name@upi)
  kycDocsRef: jsonb('kycDocsRef').$type<KycDocsRef>(),
  bankAccountRef: jsonb('bankAccountRef').$type<BankAccountRef>(),
  commissionPct: numeric('commissionPct', { precision: 5, scale: 2 }).notNull().default('30.00'),
  isBlocked: boolean('isBlocked').notNull().default(false),
  blockedReason: text('blockedReason'),
  registrationCity: text('registrationCity'),
  registrationState: text('registrationState'),
  registrationCountry: text('registrationCountry'),
  registrationCountryCode: text('registrationCountryCode'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const astrologerAuthIdentities = pgTable('astrologerAuthIdentities', {
  id: uuid('id').primaryKey().defaultRandom(),
  astrologerId: uuid('astrologerId').notNull().references(() => astrologers.id, { onDelete: 'cascade' }),
  providerKey: text('providerKey').notNull(), // phoneOtp | emailPassword
  providerUserId: text('providerUserId').notNull(),
  passwordHash: text('passwordHash'),
  lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export type Astrologer = typeof astrologers.$inferSelect;
export type NewAstrologer = typeof astrologers.$inferInsert;
export type AstrologerAuthIdentity = typeof astrologerAuthIdentities.$inferSelect;
export type NewAstrologerAuthIdentity = typeof astrologerAuthIdentities.$inferInsert;
