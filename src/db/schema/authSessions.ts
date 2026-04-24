import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const authSessions = pgTable('authSessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  audience: text('audience').notNull(), // customer | astrologer | admin
  subjectId: uuid('subjectId').notNull(),
  sessionId: text('sessionId').notNull(), // matches jti family in JWT
  refreshTokenHash: text('refreshTokenHash').notNull(),
  userAgent: text('userAgent'),
  ipAddress: text('ipAddress'),
  deviceId: text('deviceId'),      // unique device identifier from Flutter (X-Device-Id header)
  deviceModel: text('deviceModel'), // e.g. "iPhone 14 Pro"
  deviceName: text('deviceName'),   // user's device name
  osName: text('osName'),           // "iOS" | "Android" | "web"
  osVersion: text('osVersion'),     // "17.0", "14"
  issuedAt: timestamp('issuedAt', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
  revokedReason: text('revokedReason'), // logout | rotated | theftDetected | adminForced
  replacedBy: uuid('replacedBy'),
}, (t) => ({
  audienceSubjectIdx: index('idx_authSessions_audience_subjectId').on(t.audience, t.subjectId),
}));

export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
