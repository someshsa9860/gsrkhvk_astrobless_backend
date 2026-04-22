import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './adminAuth.controller.js';
import {
  AdminSendEmailOtpSchema,
  AdminVerifyEmailOtpSchema,
  AdminGoogleLoginSchema,
  AdminTotpSchema,
  AdminEnrollTotpSchema,
  AdminConfirmTotpEnrollSchema,
  AdminRefreshSchema,
  AdminLogoutSchema,
  AdminSendPhoneOtpSchema,
  AdminVerifyPhoneOtpSchema,
  AdminSkipTotpSchema,
} from './adminAuth.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const adminAuthRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/admin/auth';

  // ── Step 1a — email OTP path ────────────────────────────────────────────────

  app.post(`${prefix}/email/send-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Request email OTP',
      description: 'Sends a 6-digit OTP to the admin email. Always returns ok=true (prevents enumeration). Rate-limited 5/hour/email.',
      body: zodToJsonSchema(AdminSendEmailOtpSchema),
    },
    handler: ctrl.sendEmailOtp,
  });

  app.post(`${prefix}/email/verify-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Verify email OTP — returns tempToken for TOTP step',
      body: zodToJsonSchema(AdminVerifyEmailOtpSchema),
    },
    handler: ctrl.verifyEmailOtp,
  });

  // ── Step 1c — phone OTP path ───────────────────────────────────────────────

  app.post(`${prefix}/phone/send-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Request phone OTP',
      description: 'Sends a 6-digit SMS OTP to the admin\'s registered phone. Always returns ok=true (prevents enumeration). Rate-limited 5/hour/phone.',
      body: zodToJsonSchema(AdminSendPhoneOtpSchema),
    },
    handler: ctrl.sendPhoneOtp,
  });

  app.post(`${prefix}/phone/verify-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Verify phone OTP — returns tempToken for TOTP step',
      body: zodToJsonSchema(AdminVerifyPhoneOtpSchema),
    },
    handler: ctrl.verifyPhoneOtp,
  });

  // ── Step 1b — Google OAuth path ─────────────────────────────────────────────

  app.post(`${prefix}/google`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Login with Google — returns tempToken for TOTP step',
      description: 'Verifies a Google ID token server-side. Email must match an active admin account.',
      body: zodToJsonSchema(AdminGoogleLoginSchema),
    },
    handler: ctrl.loginWithGoogle,
  });

  // ── Step 2 — TOTP ───────────────────────────────────────────────────────────

  app.post(`${prefix}/totp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Verify TOTP — issues 1h access + 7d refresh token pair',
      body: zodToJsonSchema(AdminTotpSchema),
    },
    handler: ctrl.verifyTotp,
  });

  // ── TOTP enrollment (first login) ───────────────────────────────────────────

  app.post(`${prefix}/totp/enroll`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Begin TOTP enrollment — returns QR code data URL and secret',
      body: zodToJsonSchema(AdminEnrollTotpSchema),
    },
    handler: ctrl.beginEnrollment,
  });

  app.post(`${prefix}/totp/confirm-enroll`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Confirm TOTP enrollment — issues 1h access + 7d refresh token pair',
      body: zodToJsonSchema(AdminConfirmTotpEnrollSchema),
    },
    handler: ctrl.confirmEnrollment,
  });

  // ── Skip TOTP (optional — only when not yet enrolled) ──────────────────────

  app.post(`${prefix}/skip-totp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Skip TOTP setup — issues token pair directly (only when totpEnrolled=false)',
      description: 'Allows admins to log in without completing TOTP setup if they have not yet enrolled. Returns FORBIDDEN if TOTP is already enrolled.',
      body: zodToJsonSchema(AdminSkipTotpSchema),
    },
    handler: ctrl.skipTotp,
  });

  // ── Token refresh ───────────────────────────────────────────────────────────

  app.post(`${prefix}/refresh`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Rotate refresh token — returns new access + refresh pair',
      description: 'Refresh token rotation. Replaying a used token invalidates the entire session family (theft detection).',
      body: zodToJsonSchema(AdminRefreshSchema),
    },
    handler: ctrl.refresh,
  });

  // ── Logout ──────────────────────────────────────────────────────────────────

  app.post(`${prefix}/logout`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Revoke session',
      body: zodToJsonSchema(AdminLogoutSchema),
    },
    preHandler: [app.requireAudience('astrobless.admin' as never)],
    handler: ctrl.logout,
  });
};
