import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './adminAuth.controller.js';
import {
  AdminSendEmailOtpSchema,
  AdminVerifyEmailOtpSchema,
  AdminGoogleLoginSchema,
  AdminRefreshSchema,
  AdminLogoutSchema,
  AdminSendPhoneOtpSchema,
  AdminVerifyPhoneOtpSchema,
} from './adminAuth.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const adminAuthRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/admin/auth';

  // ── Email OTP path ──────────────────────────────────────────────────────────

  app.post(`${prefix}/email/send-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Request email OTP',
      description: 'Sends a 6-digit OTP to the admin email. Always returns ok=true (prevents enumeration). Rate-limited 3/hour/email.',
      body: zodToJsonSchema(AdminSendEmailOtpSchema),
    },
    handler: ctrl.sendEmailOtp,
  });

  app.post(`${prefix}/email/verify-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Verify email OTP — issues access + refresh token pair',
      body: zodToJsonSchema(AdminVerifyEmailOtpSchema),
    },
    handler: ctrl.verifyEmailOtp,
  });

  // ── Phone OTP path ──────────────────────────────────────────────────────────

  app.post(`${prefix}/phone/send-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Request phone OTP',
      description: "Sends a 6-digit SMS OTP to the admin's registered phone. Always returns ok=true (prevents enumeration). Rate-limited 5/hour/phone.",
      body: zodToJsonSchema(AdminSendPhoneOtpSchema),
    },
    handler: ctrl.sendPhoneOtp,
  });

  app.post(`${prefix}/phone/verify-otp`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Verify phone OTP — issues access + refresh token pair',
      body: zodToJsonSchema(AdminVerifyPhoneOtpSchema),
    },
    handler: ctrl.verifyPhoneOtp,
  });

  // ── Google OAuth path ───────────────────────────────────────────────────────

  app.post(`${prefix}/google`, {
    schema: {
      tags: ['admin:auth'],
      summary: 'Login with Google — issues access + refresh token pair',
      description: 'Verifies a Google ID token server-side. Email must match an active admin account.',
      body: zodToJsonSchema(AdminGoogleLoginSchema),
    },
    handler: ctrl.loginWithGoogle,
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
