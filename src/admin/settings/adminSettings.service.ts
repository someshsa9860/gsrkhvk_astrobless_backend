// Settings service: CRUD over the appSettings key-value table with full auditing.
// Also exposes a typed getter used by other services (e.g. minimum wallet balance).

import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { UpsertSettingInput } from './adminSettings.schema.js';

// ── Read helpers ──────────────────────────────────────────────────────────────

export async function listSettings(category?: string, isSuperAdmin = false) {
  const all = await prisma.appSetting.findMany();
  const filtered = category ? all.filter((s) => s.category === category) : all;
  return filtered.map((s) => ({
    ...s,
    value: s.isSensitive && !isSuperAdmin ? '***' : s.value,
  }));
}

export async function getSetting(key: string) {
  const setting = await prisma.appSetting.findFirst({ where: { key } });
  if (!setting) throw new AppError('NOT_FOUND', `Setting '${key}' not found.`, 404);
  return setting;
}

export async function getSettingValue<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const setting = await prisma.appSetting.findFirst({ where: { key } });
    if (!setting) return defaultValue;
    return setting.value as T;
  } catch {
    return defaultValue;
  }
}

// ── Upsert ────────────────────────────────────────────────────────────────────

export async function upsertSetting(adminId: string, key: string, input: UpsertSettingInput) {
  const existing = await prisma.appSetting.findFirst({ where: { key } });

  await prisma.appSetting.upsert({
    where: { key },
    create: {
      key,
      value: input.value,
      description: input.description ?? existing?.description ?? null,
      category: input.category ?? existing?.category ?? null,
      isSensitive: existing?.isSensitive ?? false,
      updatedBy: adminId,
      updatedAt: new Date(),
    },
    update: {
      value: input.value,
      description: input.description ?? existing?.description ?? null,
      category: input.category ?? existing?.category ?? null,
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
