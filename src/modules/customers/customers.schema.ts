import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  gender: z.string().optional(),
  dob: z.string().optional(),
  birthTime: z.string().optional(),
  birthPlace: z.string().optional(),
  birthLat: z.number().optional(),
  birthLng: z.number().optional(),
  profileImageUrl: z.string().url().optional(),
});

export const CustomerProfileResponseSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  gender: z.string().nullable(),
  dob: z.string().nullable(),
  birthPlace: z.string().nullable(),
  profileImageUrl: z.string().nullable(),
  referralCode: z.string().nullable(),
  createdAt: z.string(),
});
