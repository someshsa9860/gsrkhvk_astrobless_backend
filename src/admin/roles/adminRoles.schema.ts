// Zod schemas for admin custom-roles management endpoints.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';
import { AdminPermission } from '../shared/rbac.js';

const ALL_PERMISSION_VALUES = Object.values(AdminPermission);

// ── List roles ────────────────────────────────────────────────────────────────

export const RoleListQuerySchema = ListQuerySchema;
export type RoleListQuery = z.infer<typeof RoleListQuerySchema>;

// ── Create custom role ────────────────────────────────────────────────────────

export const CreateRoleSchema = z.object({
  name: z.string().min(2).max(80).describe('Human-readable role name'),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9-_]*$/, 'Slug must be lowercase alphanumeric with hyphens/underscores')
    .describe('Unique slug used as admin.role value'),
  description: z.string().max(500).optional().describe('Optional description of this role'),
  permissions: z
    .array(z.string())
    .refine(
      (perms) => perms.every((p) => ALL_PERMISSION_VALUES.includes(p as AdminPermission)),
      { message: 'One or more permission values are invalid.' },
    )
    .describe('List of AdminPermission values granted to this role'),
});

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

// ── Update custom role ────────────────────────────────────────────────────────

export const UpdateRoleSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  permissions: z
    .array(z.string())
    .refine(
      (perms) => perms.every((p) => ALL_PERMISSION_VALUES.includes(p as AdminPermission)),
      { message: 'One or more permission values are invalid.' },
    )
    .optional(),
});

export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
