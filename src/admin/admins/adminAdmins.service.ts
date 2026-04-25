// Admin management service — creating, listing, updating, and deactivating admin accounts.
// passwordHash is never included in returned objects.

import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type { Admin } from '@prisma/client';
import type { AdminListQuery, CreateAdminInput, UpdateAdminInput } from './adminAdmins.schema.js';

function sanitize(admin: Admin) {
  const { passwordHash: _ph, ...safe } = admin;
  return safe;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listAdmins(q: AdminListQuery) {
  const { offset, limit } = paginationFrom(q);

  const where: Record<string, unknown> = {};
  if (q.search) where['name'] = { contains: q.search, mode: 'insensitive' };
  if (q.isActive !== undefined) where['isActive'] = q.isActive;

  const [items, total] = await prisma.$transaction([
    prisma.admin.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.admin.count({ where }),
  ]);

  return toPagedResult(items.map(sanitize), total, q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getAdmin(id: string) {
  const admin = await prisma.admin.findFirst({ where: { id } });
  if (!admin) throw new AppError('NOT_FOUND', 'Admin not found.', 404);
  return sanitize(admin);
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAdmin(input: CreateAdminInput, createdByAdminId: string) {
  const existing = await prisma.admin.findFirst({ where: { email: input.email } });
  if (existing) throw new AppError('CONFLICT', 'An admin with this email already exists.', 409);

  const passwordHash = await hashPassword(input.password);
  const admin = await prisma.admin.create({
    data: { email: input.email, passwordHash, name: input.name, role: input.role },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: createdByAdminId,
    action: 'admin.create',
    targetType: 'admin',
    targetId: admin.id,
    summary: `Admin ${input.email} created with role '${input.role}'`,
    afterState: { email: input.email, role: input.role },
  });

  return sanitize(admin);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateAdmin(actorId: string, targetAdminId: string, input: UpdateAdminInput) {
  const before = await prisma.admin.findFirst({ where: { id: targetAdminId } });
  if (!before) throw new AppError('NOT_FOUND', 'Admin not found.', 404);

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) data['name'] = input.name;
  if (input.role !== undefined) data['role'] = input.role;
  if (input.isActive !== undefined) data['isActive'] = input.isActive;
  if (input.customPermissions !== undefined) data['customPermissions'] = input.customPermissions;

  const updated = await prisma.admin.update({ where: { id: targetAdminId }, data });

  await writeAuditLog({
    actorType: 'admin',
    actorId: actorId,
    action: 'admin.update',
    targetType: 'admin',
    targetId: targetAdminId,
    summary: `Admin ${before.email} updated`,
    beforeState: { name: before.name, role: before.role, isActive: before.isActive },
    afterState: { name: updated.name, role: updated.role, isActive: updated.isActive },
  });

  return sanitize(updated);
}

// ── Deactivate ────────────────────────────────────────────────────────────────

export async function deactivateAdmin(actorId: string, targetAdminId: string) {
  if (actorId === targetAdminId) {
    throw new AppError('VALIDATION', 'An admin cannot deactivate their own account.', 400);
  }

  const before = await prisma.admin.findFirst({ where: { id: targetAdminId } });
  if (!before) throw new AppError('NOT_FOUND', 'Admin not found.', 404);

  await prisma.admin.update({ where: { id: targetAdminId }, data: { isActive: false, updatedAt: new Date() } });

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
