import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './customerAuth.controller.js';
import {
  SendPhoneOtpSchema,
  VerifyPhoneOtpSchema,
  EmailSignupSchema,
  VerifyEmailOtpSchema,
  ResendEmailOtpSchema,
  EmailLoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  GoogleAuthSchema,
  AppleAuthSchema,
  RefreshTokenSchema,
} from './customerAuth.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const customerAuthRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/customer/auth';

  app.post(`${prefix}/phone/send-otp`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Send phone OTP',
      description: 'Rate-limited to 5/hour per phone. Sends a 6-digit OTP via SMS.',
      body: zodToJsonSchema(SendPhoneOtpSchema),
    },
    handler: ctrl.sendPhoneOtp,
  });

  app.post(`${prefix}/phone/verify-otp`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Verify phone OTP and issue tokens',
      body: zodToJsonSchema(VerifyPhoneOtpSchema),
    },
    handler: ctrl.verifyPhoneOtp,
  });

  app.post(`${prefix}/email/signup`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Sign up with email + password',
      description: 'Creates account and sends email verification OTP.',
      body: zodToJsonSchema(EmailSignupSchema),
    },
    handler: ctrl.emailSignup,
  });

  app.post(`${prefix}/email/verify-otp`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Verify email OTP and issue tokens',
      body: zodToJsonSchema(VerifyEmailOtpSchema),
    },
    handler: ctrl.verifyEmailOtp,
  });

  app.post(`${prefix}/email/resend-otp`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Resend email verification OTP',
      description: 'Rate-limited to 3/hour per email.',
      body: zodToJsonSchema(ResendEmailOtpSchema),
    },
    handler: ctrl.resendEmailOtp,
  });

  app.post(`${prefix}/email/login`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Login with email + password',
      body: zodToJsonSchema(EmailLoginSchema),
    },
    handler: ctrl.emailLogin,
  });

  app.post(`${prefix}/email/forgot-password`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Request password reset OTP',
      description: 'Sends a 6-digit OTP to the email. Always responds with 200 (no email enumeration).',
      body: zodToJsonSchema(ForgotPasswordSchema),
    },
    handler: ctrl.forgotPassword,
  });

  app.post(`${prefix}/email/reset-password`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Reset password using OTP',
      body: zodToJsonSchema(ResetPasswordSchema),
    },
    handler: ctrl.resetPassword,
  });

  app.post(`${prefix}/google`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Login / signup with Google ID token',
      body: zodToJsonSchema(GoogleAuthSchema),
    },
    handler: ctrl.googleAuth,
  });

  app.post(`${prefix}/apple`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Login / signup with Apple identity token',
      body: zodToJsonSchema(AppleAuthSchema),
    },
    handler: ctrl.appleAuth,
  });

  app.post(`${prefix}/refresh`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Rotate refresh token and issue new access token',
      body: zodToJsonSchema(RefreshTokenSchema),
    },
    handler: ctrl.refreshToken,
  });

  app.post(`${prefix}/logout`, {
    schema: {
      tags: ['customer:auth'],
      summary: 'Revoke current session',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: ctrl.logout,
  });
};
