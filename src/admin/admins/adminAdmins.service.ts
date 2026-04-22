// Admin management service — creating, listing, updating, and deactivating admin accounts.
// passwordHash is never included in returned objects.

import { eq, ilike, desc, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { admins } from '../../db/schema/admins.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { AdminListQuery, CreateAdminInput, UpdateAdminInput } from './adminAdmins.schema.js';

// Helper: strip passwordHash before returning to callers — never expose it.
function sanitize(admin: typeof admins.$inferSelect) {
  const { passwordHash: _ph, totpSecret: _ts, ...safe } = admin;
  return safe;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listAdmins(q: AdminListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.search) conditions.push(ilike(admins.name, `%${q.search}%`));
  if (q.isActive !== undefined) conditions.push(eq(admins.isActive, q.isActive));

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.admins.findMany({ where, limit, offset, orderBy: [desc(admins.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(admins).where(where),
  ]);

  return toPagedResult(items.map(sanitize), Number(countResult[0]?.count ?? 0), q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getAdmin(id: string) {
  const admin = await db.query.admins.findFirst({ where: eq(admins.id, id) });
  if (!admin) throw new AppError('NOT_FOUND', 'Admin not found.', 404);
  return sanitize(admin);
}

// ── Create ────────────────────────────────────────────────────────────────────

// Creates a new admin account; rejects duplicate emails.
export async function createAdmin(input: CreateAdminInput, createdByAdminId: string) {
  const existing = await db.query.admins.findFirst({ where: eq(admins.email, input.email) });
  if (existing) throw new AppError('CONFLICT', 'An admin with this email already exists.', 409);

  const passwordHash = await hashPassword(input.password);
  const [admin] = await db
    .insert(admins)
    .values({ email: input.email, passwordHash, name: input.name, role: input.role })
    .returning();

  await writeAuditLog({
    actorType: 'admin',
    actorId: createdByAdminId,
    action: 'admin.create',
    targetType: 'admin',
    targetId: admin!.id,
    summary: `Admin ${input.email} created with role '${input.role}'`,
    afterState: { email: input.email, role: input.role },
  });

  return sanitize(admin!);
}

// ── Update ────────────────────────────────────────────────────────────────────

// Updates editable fields; before/after diff captured for audit.
export async function updateAdmin(actorId: string, targetAdminId: string, input: UpdateAdminInput) {
  const before = await db.query.admins.findFirst({ where: eq(admins.id, targetAdminId) });
  if (!before) throw new AppError('NOT_FOUND', 'Admin not found.', 404);

  const patch: Partial<typeof admins.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.role !== undefined) patch.role = input.role;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.customPermissions !== undefined) patch.customPermissions = input.customPermissions;
  patch.updatedAt = new Date();

  const [updated] = await db.update(admins).set(patch).where(eq(admins.id, targetAdminId)).returning();

  await writeAuditLog({
    actorType: 'admin',
    actorId: actorId,
    action: 'admin.update',
    targetType: 'admin',
    targetId: targetAdminId,
    summary: `Admin ${before.email} updated`,
    beforeState: { name: before.name, role: before.role, isActive: before.isActive },
    afterState: { name: updated!.name, role: updated!.role, isActive: updated!.isActive },
  });

  return sanitize(updated!);
}

// ── Deactivate ────────────────────────────────────────────────────────────────

// Soft-deactivates rather than deleting to preserve audit trail references.
export async function deactivateAdmin(actorId: string, targetAdminId: string) {
  if (actorId === targetAdminId) {
    throw new AppError('VALIDATION', 'An admin cannot deactivate their own account.', 400);
  }

  const before = await db.query.admins.findFirst({ where: eq(admins.id, targetAdminId) });
  if (!before) throw new AppError('NOT_FOUND', 'Admin not found.', 404);

  await db.update(admins).set({ isActive: false, updatedAt: new Date() }).where(eq(admins.id, targetAdminId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: actorId,
    action: 'admin.deactivate',
    targetType: 'admin',
    targetId: targetAdminId,
    summary: `Admin ${before.email} deactivated`,
    beforeState: { isActive: true },
    afterState: { isActive: false },
  });
}
