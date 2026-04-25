// Business logic for admin custom-roles management.

import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { ADMIN_ROLES } from '../shared/rbac.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { RoleListQuery, CreateRoleInput, UpdateRoleInput } from './adminRoles.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

export async function listRoles(q: RoleListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.search) where['name'] = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await prisma.$transaction([
    prisma.adminCustomRole.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.adminCustomRole.count({ where }),
  ]);

  return toPagedResult(items, total, q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getRole(id: string) {
  const role = await prisma.adminCustomRole.findFirst({ where: { id } });
  if (!role) throw new AppError('NOT_FOUND', 'Custom role not found.', 404);
  return role;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createRole(adminId: string, input: CreateRoleInput) {
  if (ADMIN_ROLES.includes(input.slug as never)) {
    throw new AppError('VALIDATION', `"${input.slug}" is a reserved built-in role slug.`, 400);
  }
  const existing = await prisma.adminCustomRole.findFirst({ where: { slug: input.slug } });
  if (existing) throw new AppError('VALIDATION', `A role with slug "${input.slug}" already exists.`, 400);

  const created = await prisma.adminCustomRole.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      permissions: input.permissions,
      isSystem: false,
      createdBy: adminId,
    },
  });

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
  const before = await prisma.adminCustomRole.findFirst({ where: { id } });
  if (!before) throw new AppError('NOT_FOUND', 'Custom role not found.', 404);
  if (before.isSystem) throw new AppError('FORBIDDEN', 'System roles cannot be modified.', 403);

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) data['name'] = input.name;
  if (input.description !== undefined) data['description'] = input.description;
  if (input.permissions !== undefined) data['permissions'] = input.permissions;

  const updated = await prisma.adminCustomRole.update({ where: { id }, data });

  // When permissions change, sync all admins assigned to this role.
  if (input.permissions !== undefined) {
    await prisma.admin.updateMany({
      where: { role: before.slug },
      data: { customPermissions: input.permissions, updatedAt: new Date() },
    });
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
  const role = await prisma.adminCustomRole.findFirst({ where: { id } });
  if (!role) throw new AppError('NOT_FOUND', 'Custom role not found.', 404);
  if (role.isSystem) throw new AppError('FORBIDDEN', 'System roles cannot be deleted.', 403);

  const assignedCount = await prisma.admin.count({ where: { role: role.slug } });
  if (assignedCount > 0) {
    throw new AppError(
      'VALIDATION',
      `Cannot delete role "${role.name}" — ${assignedCount} admin(s) are still assigned to it.`,
      400,
    );
  }

  await prisma.adminCustomRole.delete({ where: { id } });

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
