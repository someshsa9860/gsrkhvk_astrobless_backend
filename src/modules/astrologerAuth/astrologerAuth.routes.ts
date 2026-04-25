import { JWT_AUDIENCE } from '../../config/constants.js';
import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from './astrologerAuth.controller.js';
import {
  SendPhoneOtpSchema,
  VerifyPhoneOtpSchema,
  EmailSignupSchema,
  VerifyEmailOtpSchema,
  EmailLoginSchema,
  RefreshTokenSchema,
  AppleAuthSchema,
  ResendEmailOtpSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from './astrologerAuth.schema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const astrologerAuthRoutes: FastifyPluginAsync = async (app) => {
  const prefix = '/v1/astrologer/auth';

  app.post(`${prefix}/phone/send-otp`, {
    schema: { tags: ['astrologer:auth'], summary: 'Send phone OTP', body: zodToJsonSchema(SendPhoneOtpSchema) },
    handler: ctrl.sendPhoneOtp,
  });

  app.post(`${prefix}/phone/verify-otp`, {
    schema: { tags: ['astrologer:auth'], summary: 'Verify phone OTP and issue tokens', body: zodToJsonSchema(VerifyPhoneOtpSchema) },
    handler: ctrl.verifyPhoneOtp,
  });

  app.post(`${prefix}/email/signup`, {
    schema: { tags: ['astrologer:auth'], summary: 'Sign up with email + password', body: zodToJsonSchema(EmailSignupSchema) },
    handler: ctrl.emailSignup,
  });

  app.post(`${prefix}/email/verify-otp`, {
    schema: { tags: ['astrologer:auth'], summary: 'Verify email OTP', body: zodToJsonSchema(VerifyEmailOtpSchema) },
    handler: ctrl.verifyEmailOtp,
  });

  app.post(`${prefix}/email/resend-otp`, {
    schema: { tags: ['astrologer:auth'], summary: 'Resend email verification OTP', description: 'Rate-limited to 3/hour per email.', body: zodToJsonSchema(ResendEmailOtpSchema) },
    handler: ctrl.resendEmailOtp,
  });

  app.post(`${prefix}/email/login`, {
    schema: { tags: ['astrologer:auth'], summary: 'Login with email + password', body: zodToJsonSchema(EmailLoginSchema) },
    handler: ctrl.emailLogin,
  });

  app.post(`${prefix}/email/forgot-password`, {
    schema: { tags: ['astrologer:auth'], summary: 'Request password reset OTP', description: 'Sends a 6-digit OTP to the email. Always responds with 200 (no email enumeration).', body: zodToJsonSchema(ForgotPasswordSchema) },
    handler: ctrl.forgotPassword,
  });

  app.post(`${prefix}/email/reset-password`, {
    schema: { tags: ['astrologer:auth'], summary: 'Reset password using OTP', body: zodToJsonSchema(ResetPasswordSchema) },
    handler: ctrl.resetPassword,
  });

  app.post(`${prefix}/refresh`, {
    schema: { tags: ['astrologer:auth'], summary: 'Rotate refresh token', body: zodToJsonSchema(RefreshTokenSchema) },
    handler: ctrl.refreshToken,
  });

  app.post(`${prefix}/apple`, {
    schema: { tags: ['astrologer:auth'], summary: 'Sign in / sign up with Apple', body: zodToJsonSchema(AppleAuthSchema) },
    handler: ctrl.appleAuth,
  });

  app.post(`${prefix}/logout`, {
    schema: { tags: ['astrologer:auth'], summary: 'Revoke current session', security: [{ bearerAuth: [] }] },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: ctrl.logout,
  });
};
