import { z } from 'zod';

export const CreateAddressSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  name: z.string().min(1),
  phone: z.string().min(10),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().length(2).default('IN'),
  pincode: z.string().min(5).max(10),
  isDefault: z.boolean().optional(),
});

export const UpdateAddressSchema = CreateAddressSchema.partial();

export const AddressResponseSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  label: z.string(),
  name: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  pincode: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
