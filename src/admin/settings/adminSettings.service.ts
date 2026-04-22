// Settings service: CRUD over the appSettings key-value table with full auditing.
// Also exposes a typed getter used by other services (e.g. minimum wallet balance).

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { appSettings } from '../../db/schema/adminExtras.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { UpsertSettingInput } from './adminSettings.schema.js';

// ── Read helpers ──────────────────────────────────────────────────────────────

// Lists all settings; sensitive values are masked unless the caller is superAdmin.
export async function listSettings(category?: string, isSuperAdmin = false) {
  const all = await db.query.appSettings.findMany();
  const filtered = category ? all.filter((s) => s.category === category) : all;
  return filtered.map((s) => ({
    ...s,
    value: s.isSensitive && !isSuperAdmin ? '***' : s.value,
  }));
}

// Returns a single setting row; throws if not found.
export async function getSetting(key: string) {
  const setting = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  if (!setting) throw new AppError('NOT_FOUND', `Setting '${key}' not found.`, 404);
  return setting;
}

// Typed getter for use by other services — returns the stored value or the default.
export async function getSettingValue<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const setting = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
    if (!setting) return defaultValue;
    return setting.value as T;
  } catch {
    return defaultValue;
  }
}

// ── Upsert ────────────────────────────────────────────────────────────────────

// Creates or updates a setting and writes before/after state to the audit log.
export async function upsertSetting(adminId: string, key: string, input: UpsertSettingInput) {
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });

  await db
    .insert(appSettings)
    .values({
      key,
      value: input.value,
      description: input.description ?? existing?.description,
      category: input.category ?? existing?.category,
      isSensitive: existing?.isSensitive ?? false,
      updatedBy: adminId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: input.value,
        description: input.description ?? existing?.description,
        category: input.category ?? existing?.category,
        updatedBy: adminId,
        updatedAt: new Date(),
      },
    });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'settings.upsert',
    targetType: 'appSetting',
    summary: `Setting '${key}' updated. Reason: ${input.reason}`,
    beforeState: existing ? { value: existing.value } : undefined,
    afterState: { value: input.value },
    metadata: { key, reason: input.reason },
  });

  return { key, value: input.value };
}
