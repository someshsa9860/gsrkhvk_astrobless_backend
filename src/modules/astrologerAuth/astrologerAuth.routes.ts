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

  app.post(`${prefix}/email/login`, {
    schema: { tags: ['astrologer:auth'], summary: 'Login with email + password', body: zodToJsonSchema(EmailLoginSchema) },
    handler: ctrl.emailLogin,
  });

  app.post(`${prefix}/refresh`, {
    schema: { tags: ['astrologer:auth'], summary: 'Rotate refresh token', body: zodToJsonSchema(RefreshTokenSchema) },
    handler: ctrl.refreshToken,
  });

  app.post(`${prefix}/apple`, {
    schema: { tags: ['astrologer:auth'], summary: 'Sign in / sign up with Apple', body: zodToJsonSchema(AppleAuthSchema) },
    handler: ctrl.appleAuth,
  });
};
