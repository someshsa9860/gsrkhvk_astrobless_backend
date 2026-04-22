// Zod schemas for the admin-manages-admins endpoints.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';
import { ADMIN_ROLES } from '../shared/rbac.js';

// ── List ──────────────────────────────────────────────────────────────────────

export const AdminListQuerySchema = ListQuerySchema.extend({
  role: z.enum(ADMIN_ROLES as [string, ...string[]]).optional().describe('Filter by admin role'),
  isActive: z.coerce.boolean().optional().describe('Filter by active/inactive state'),
});

export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;

// ── Create ────────────────────────────────────────────────────────────────────

export const CreateAdminSchema = z.object({
  email: z.string().email().describe('Admin email address'),
  password: z.string().min(8).describe('Initial password (min 8 chars)'),
  name: z.string().min(1).describe('Display name'),
  role: z.enum(ADMIN_ROLES as [string, ...string[]]).describe('Assigned role'),
});

export type CreateAdminInput = z.infer<typeof CreateAdminSchema>;

// ── Update ────────────────────────────────────────────────────────────────────

export const UpdateAdminSchema = z.object({
  name: z.string().min(1).optional().describe('Updated display name'),
  role: z.enum(ADMIN_ROLES as [string, ...string[]]).optional().describe('New role'),
  isActive: z.boolean().optional().describe('Activate or deactivate the account'),
  customPermissions: z.array(z.string()).optional().describe('Per-admin permission overrides'),
});

export type UpdateAdminInput = z.infer<typeof UpdateAdminSchema>;
