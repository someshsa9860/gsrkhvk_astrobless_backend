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

// Step 1c — phone OTP path
export const AdminSendPhoneOtpSchema = z.object({
  phone: z.string().min(10).max(15),
});

export const AdminVerifyPhoneOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
});

// Refresh token rotation
export const AdminRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Logout
export const AdminLogoutSchema = z.object({
  sessionId: z.string().uuid(),
});
