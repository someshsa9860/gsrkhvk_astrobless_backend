import { z } from 'zod';

// ── Products ──────────────────────────────────────────────────────────────────

export const ProductListQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  inStock:  z.coerce.boolean().optional(),
  search:   z.string().optional(),
});

export const CreateProductSchema = z.object({
  sku:         z.string().min(1),
  title:       z.string().min(1),
  description: z.string().optional(),
  price:       z.number().positive(),
  category:    z.string().optional(),
  imageKeys:   z.array(z.string()).optional(),
  stock:       z.number().int().min(0).optional(),
  isActive:    z.boolean().optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial().omit({ sku: true });

export const RestockSchema = z.object({
  qty:    z.number().int().positive(),
  reason: z.string().optional(),
});

// ── Orders ────────────────────────────────────────────────────────────────────

export const OrderListQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional(),
  limit:      z.coerce.number().int().min(1).max(100).optional(),
  status:     z.string().optional(),
  customerId: z.string().optional(),
  from:       z.string().optional(),
  to:         z.string().optional(),
  search:     z.string().optional(),
});

export const UpdateOrderStatusSchema = z.object({
  status:         z.enum(['paid', 'packed', 'shipped', 'delivered', 'cancelled']),
  note:           z.string().optional(),
  trackingNumber: z.string().optional(),
});

export const OrderRefundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(3),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type ProductListQuery     = z.infer<typeof ProductListQuerySchema>;
export type CreateProductInput   = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput   = z.infer<typeof UpdateProductSchema>;
export type RestockInput         = z.infer<typeof RestockSchema>;
export type OrderListQuery       = z.infer<typeof OrderListQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
export type OrderRefundInput     = z.infer<typeof OrderRefundSchema>;
