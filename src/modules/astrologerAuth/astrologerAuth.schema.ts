import { z } from 'zod';

export const SendPhoneOtpSchema = z.object({
  phone: z.string().min(10).describe('Phone number in E.164 format'),
});

export const VerifyPhoneOtpSchema = z.object({
  phone: z.string().min(10),
  otp: z.string().length(6),
  displayName: z.string().min(1).optional(),
});

export const EmailSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  phone: z.string().min(10).optional(),
});

export const VerifyEmailOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const EmailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const AppleAuthSchema = z.object({
  identityToken: z.string().min(1).describe('Apple identity token from Sign in with Apple'),
  nonce: z.string().min(1).describe('Nonce used during Apple auth flow'),
  displayName: z.string().min(1).optional().describe('User display name (only available on first sign-in)'),
});
