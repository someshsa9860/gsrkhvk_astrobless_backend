import { z } from 'zod';

// ── Recharge Packs ────────────────────────────────────────────────────────────

export const CreateRechargePackSchema = z.object({
  label:    z.string().optional(),
  amount:   z.number().positive(),
  bonus:    z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const UpdateRechargePackSchema = CreateRechargePackSchema.partial();

// ── Coupons ───────────────────────────────────────────────────────────────────

export const CouponListQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
  isActive: z.coerce.boolean().optional(),
  search:   z.string().optional(),
});

const CouponBaseSchema = z.object({
  code:              z.string().min(1),
  type:              z.enum(['flat', 'percent']),
  value:             z.number().positive().optional(),
  valuePercent:      z.number().min(0.01).max(100).optional(),
  maxDiscount:       z.number().positive().optional(),
  minAmount:         z.number().positive().optional(),
  validFrom:         z.string().datetime(),
  validTo:           z.string().datetime(),
  usageLimit:        z.number().int().positive().optional(),
  perCustomerLimit:  z.number().int().positive().optional(),
  isActive:          z.boolean().optional(),
  description:       z.string().optional(),
});

export const CreateCouponSchema = CouponBaseSchema;
export const UpdateCouponSchema = CouponBaseSchema.partial().omit({ code: true });

export type CreateRechargePackInput = z.infer<typeof CreateRechargePackSchema>;
export type UpdateRechargePackInput = z.infer<typeof UpdateRechargePackSchema>;
export type CouponListQuery         = z.infer<typeof CouponListQuerySchema>;
export type CreateCouponInput       = z.infer<typeof CreateCouponSchema>;
export type UpdateCouponInput       = z.infer<typeof UpdateCouponSchema>;

