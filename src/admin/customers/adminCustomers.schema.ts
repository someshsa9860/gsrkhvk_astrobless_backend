// Zod schemas for admin customer endpoints; used for runtime validation + OpenAPI generation.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';

// ── List customers ────────────────────────────────────────────────────────────

export const CustomerListQuerySchema = ListQuerySchema.extend({
  isBlocked: z.coerce.boolean().optional().describe('Filter by blocked status'),
  signupSince: z.string().datetime().optional().describe('Only customers created after this ISO 8601 timestamp'),
  minSpend: z.coerce.number().min(0).optional().describe('Minimum lifetime spend in ₹'),
});

export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;

// ── Block customer ────────────────────────────────────────────────────────────

export const BlockCustomerSchema = z.object({
  reason: z.string().optional().describe('Optional reason for the block (audited)'),
});

export type BlockCustomerInput = z.infer<typeof BlockCustomerSchema>;

// ── Wallet credit ─────────────────────────────────────────────────────────────

export const WalletAdjustSchema = z.object({
  amount: z.number().positive().describe('Amount to credit in ₹ (e.g. 50.00 = ₹50)'),
  reason: z.string().optional().describe('Optional reason for audit trail'),
  type: z.enum(['GOODWILL', 'COMPENSATION', 'BONUS', 'ADMIN_ADJUST']).describe('Transaction sub-type'),
});

export type WalletAdjustInput = z.infer<typeof WalletAdjustSchema>;

// ── Create customer ───────────────────────────────────────────────────────────

export const CreateCustomerSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    dob: z.string().date().optional().describe('ISO date YYYY-MM-DD'),
  })
  .refine((d) => d.phone || d.email, { message: 'Either phone or email is required.' });

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

// ── Update customer ───────────────────────────────────────────────────────────

export const UpdateCustomerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  dob: z.string().date().optional().nullable(),
});

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;
