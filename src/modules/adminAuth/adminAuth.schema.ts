import { z } from 'zod';

// Step 1a — email OTP path
export const AdminSendEmailOtpSchema = z.object({
  email: z.string().email(),
});

export const AdminVerifyEmailOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

// Step 1b — Google OAuth path
export const AdminGoogleLoginSchema = z.object({
  idToken: z.string().min(1),
});

// Step 2 — TOTP verification (after either step-1 path)
export const AdminTotpSchema = z.object({
  tempToken: z.string().uuid(),
  code: z.string().length(6),
});

// TOTP enrollment (first login only)
export const AdminEnrollTotpSchema = z.object({
  tempToken: z.string().uuid(),
});

export const AdminConfirmTotpEnrollSchema = z.object({
  tempToken: z.string().uuid(),
  code: z.string().length(6),
});

// Refresh token rotation
export const AdminRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Logout
export const AdminLogoutSchema = z.object({
  sessionId: z.string().uuid(),
});

// Step 1c — phone OTP path
export const AdminSendPhoneOtpSchema = z.object({
  phone: z.string().min(10).max(15),
});

export const AdminVerifyPhoneOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
});

// Skip TOTP (only valid when totpEnrolled=false)
export const AdminSkipTotpSchema = z.object({
  tempToken: z.string().uuid(),
});
