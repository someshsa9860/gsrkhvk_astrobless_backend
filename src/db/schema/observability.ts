import { pgTable, uuid, text, jsonb, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';

export const auditLog = pgTable('auditLog', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorType: text('actorType').notNull(), // customer | astrologer | admin | system | provider
  actorId: uuid('actorId'),
  action: text('action').notNull(), // resource.verb — e.g. wallet.topup
  targetType: text('targetType'),
  targetId: uuid('targetId'),
  summary: text('summary').notNull(),
  beforeState: jsonb('beforeState'),
  afterState: jsonb('afterState'),
  metadata: jsonb('metadata'),
  traceId: text('traceId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index('idx_auditLog_actorId_createdAt').on(t.actorType, t.actorId, t.createdAt),
  targetIdx: index('idx_auditLog_targetId').on(t.targetType, t.targetId),
  actionIdx: index('idx_auditLog_action').on(t.action),
  traceIdx: index('idx_auditLog_traceId').on(t.traceId),
}));

export const systemErrors = pgTable('systemErrors', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: text('traceId'),
  errorCode: text('errorCode'),
  errorName: text('errorName').notNull(),
  errorMessage: text('errorMessage').notNull(),
  stackTrace: text('stackTrace'),
  severity: text('severity').notNull(), // debug | info | warning | error | critical
  source: text('source').notNull(), // httpRoute | socketHandler | bullmqJob | scheduledTask | webhook
  sourceDetail: text('sourceDetail'),
  audience: text('audience'),
  actorType: text('actorType'),
  actorId: uuid('actorId'),
  httpMethod: text('httpMethod'),
  httpPath: text('httpPath'),
  httpStatusCode: integer('httpStatusCode'),
  requestId: text('requestId'),
  serverHostname: text('serverHostname'),
  serverRegion: text('serverRegion'),
  appVersion: text('appVersion'),
  platform: text('platform'),
  environment: text('environment').notNull(),
  metadata: jsonb('metadata'),
  fingerprint: text('fingerprint').notNull(),
  occurrenceCount: integer('occurrenceCount').notNull().default(1),
  firstSeenAt: timestamp('firstSeenAt', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('lastSeenAt', { withTimezone: true }).notNull().defaultNow(),
  isResolved: boolean('isResolved').notNull().default(false),
  resolvedBy: uuid('resolvedBy'),
  resolvedAt: timestamp('resolvedAt', { withTimezone: true }),
  resolutionNote: text('resolutionNote'),
  sentryEventId: text('sentryEventId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  fingerprintIdx: index('idx_systemErrors_fingerprint').on(t.fingerprint),
  createdAtIdx: index('idx_systemErrors_createdAt').on(t.createdAt),
  severityIdx: index('idx_systemErrors_severity').on(t.severity),
  resolvedIdx: index('idx_systemErrors_isResolved').on(t.isResolved, t.lastSeenAt),
  sourceIdx: index('idx_systemErrors_source').on(t.source),
}));

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type SystemError = typeof systemErrors.$inferSelect;
export type NewSystemError = typeof systemErrors.$inferInsert;
