// Business logic for admin custom-roles management.

import { eq, ilike, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adminCustomRoles } from '../../db/schema/adminExtras.js';
import { admins } from '../../db/schema/admins.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { ADMIN_ROLES } from '../shared/rbac.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { RoleListQuery, CreateRoleInput, UpdateRoleInput } from './adminRoles.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

export async function listRoles(q: RoleListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.search) conditions.push(ilike(adminCustomRoles.name, `%${q.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.adminCustomRoles.findMany({ where, limit, offset, orderBy: [desc(adminCustomRoles.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(adminCustomRoles).where(where),
  ]);

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getRole(id: string) {
  const role = await db.query.adminCustomRoles.findFirst({ where: eq(adminCustomRoles.id, id) });
  if (!role) throw new AppError('NOT_FOUND', 'Custom role not found.', 404);
  return role;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createRole(adminId: string, input: CreateRoleInput) {
  // Prevent shadowing built-in roles.
  if (ADMIN_ROLES.includes(input.slug as never)) {
    throw new AppError('VALIDATION', `"${input.slug}" is a reserved built-in role slug.`, 400);
  }
  const existing = await db.query.adminCustomRoles.findFirst({
    where: eq(adminCustomRoles.slug, input.slug),
  });
  if (existing) throw new AppError('VALIDATION', `A role with slug "${input.slug}" already exists.`, 400);

  const [created] = await db
    .insert(adminCustomRoles)
    .values({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      permissions: input.permissions,
      isSystem: false,
      createdBy: adminId,
    })
    .returning();

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'role.create',
    targetType: 'adminCustomRole',
    targetId: created.id,
    summary: `Custom role "${input.name}" (${input.slug}) created with ${input.permissions.length} permissions.`,
    beforeState: null,
    afterState: created,
  });

  return created;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateRole(adminId: string, id: string, input: UpdateRoleInput) {
  const before = await db.query.adminCustomRoles.findFirst({ where: eq(adminCustomRoles.id, id) });
  if (!before) throw new AppError('NOT_FOUND', 'Custom role not found.', 404);
  if (before.isSystem) throw new AppError('FORBIDDEN', 'System roles cannot be modified.', 403);

  const updates: Partial<typeof before> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.permissions !== undefined) updates.permissions = input.permissions;

  const [updated] = await db
    .update(adminCustomRoles)
    .set(updates)
    .where(eq(adminCustomRoles.id, id))
    .returning();

  // When permissions change, sync all admins assigned to this role so their
  // customPermissions reflect the new set (used by frontend RBAC).
  if (input.permissions !== undefined) {
    await db
      .update(admins)
      .set({ customPermissions: input.permissions, updatedAt: new Date() })
      .where(eq(admins.role, before.slug));
  }

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'role.update',
    targetType: 'adminCustomRole',
    targetId: id,
    summary: `Custom role "${before.name}" updated.`,
    beforeState: before,
    afterState: updated,
  });

  return updated;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteRole(adminId: string, id: string) {
  const role = await db.query.adminCustomRoles.findFirst({ where: eq(adminCustomRoles.id, id) });
  if (!role) throw new AppError('NOT_FOUND', 'Custom role not found.', 404);
  if (role.isSystem) throw new AppError('FORBIDDEN', 'System roles cannot be deleted.', 403);

  // Prevent deletion if any admin is still assigned this role.
  const assignedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(admins)
    .where(eq(admins.role, role.slug));
  if (Number(assignedCount[0]?.count ?? 0) > 0) {
    throw new AppError(
      'VALIDATION',
      `Cannot delete role "${role.name}" — ${assignedCount[0]?.count} admin(s) are still assigned to it.`,
      400,
    );
  }

  await db.delete(adminCustomRoles).where(eq(adminCustomRoles.id, id));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'role.delete',
    targetType: 'adminCustomRole',
    targetId: id,
    summary: `Custom role "${role.name}" (${role.slug}) deleted.`,
    beforeState: role,
    afterState: null,
  });
}
