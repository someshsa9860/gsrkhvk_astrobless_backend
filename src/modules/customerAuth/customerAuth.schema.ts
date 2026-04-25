import { z } from 'zod';

export const SendPhoneOtpSchema = z.object({
  phone: z.string().min(10).describe('Phone number in E.164 format'),
});

export const VerifyPhoneOtpSchema = z.object({
  phone: z.string().min(10),
  otp: z.string().length(6),
  name: z.string().optional(),
});

export const EmailSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export const VerifyEmailOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const ResendEmailOtpSchema = z.object({
  email: z.string().email(),
});

export const EmailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8),
});

export const GoogleAuthSchema = z.object({
  idToken: z.string().min(1).describe('Google ID token from GoogleSignIn'),
});

export const AppleAuthSchema = z.object({
  identityToken: z.string().min(1).describe('Apple identity token'),
  nonce: z.string().min(1),
  name: z.string().optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export const PendingVerificationResponseSchema = z.object({
  pendingVerification: z.literal(true),
  message: z.string(),
});
