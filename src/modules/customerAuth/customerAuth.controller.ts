import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './customerAuth.service.js';
import type {
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
import type { z } from 'zod';

export async function sendPhoneOtp(req: FastifyRequest<{ Body: z.infer<typeof SendPhoneOtpSchema> }>, reply: FastifyReply) {
  await service.sendPhoneOtp(req.body.phone);
  return reply.send({ ok: true, data: { message: 'OTP sent.' }, traceId: req.requestContext.traceId });
}

export async function verifyPhoneOtp(req: FastifyRequest<{ Body: z.infer<typeof VerifyPhoneOtpSchema> }>, reply: FastifyReply) {
  const ip = req.headers['x-forwarded-for'] as string | undefined ?? req.ip;
  const tokens = await service.verifyPhoneOtp(req.body.phone, req.body.otp, req.body.name, ip);
  return reply.send({ ok: true, data: { ...tokens, expiresIn: 900 }, traceId: req.requestContext.traceId });
}

export async function emailSignup(req: FastifyRequest<{ Body: z.infer<typeof EmailSignupSchema> }>, reply: FastifyReply) {
  const ip = req.headers['x-forwarded-for'] as string | undefined ?? req.ip;
  const result = await service.emailSignup(req.body.email, req.body.password, req.body.name, ip);
  return reply.status(201).send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function verifyEmailOtp(req: FastifyRequest<{ Body: z.infer<typeof VerifyEmailOtpSchema> }>, reply: FastifyReply) {
  const tokens = await service.verifyEmailOtp(req.body.email, req.body.otp);
  return reply.send({ ok: true, data: { ...tokens, expiresIn: 900 }, traceId: req.requestContext.traceId });
}

export async function resendEmailOtp(req: FastifyRequest<{ Body: z.infer<typeof ResendEmailOtpSchema> }>, reply: FastifyReply) {
  await service.sendPhoneOtp(req.body.email); // reuse OTP generator for email
  return reply.send({ ok: true, data: { message: 'OTP resent.' }, traceId: req.requestContext.traceId });
}

export async function emailLogin(req: FastifyRequest<{ Body: z.infer<typeof EmailLoginSchema> }>, reply: FastifyReply) {
  const tokens = await service.emailLogin(req.body.email, req.body.password);
  return reply.send({ ok: true, data: { ...tokens, expiresIn: 900 }, traceId: req.requestContext.traceId });
}

export async function googleAuth(req: FastifyRequest<{ Body: z.infer<typeof GoogleAuthSchema> }>, reply: FastifyReply) {
  const tokens = await service.googleAuth(req.body.idToken);
  return reply.send({ ok: true, data: { ...tokens, expiresIn: 900 }, traceId: req.requestContext.traceId });
}

export async function appleAuth(req: FastifyRequest<{ Body: z.infer<typeof AppleAuthSchema> }>, reply: FastifyReply) {
  const tokens = await service.appleAuth(req.body.identityToken, req.body.nonce, req.body.name);
  return reply.send({ ok: true, data: { ...tokens, expiresIn: 900 }, traceId: req.requestContext.traceId });
}

export async function refreshToken(req: FastifyRequest<{ Body: z.infer<typeof RefreshTokenSchema> }>, reply: FastifyReply) {
  const tokens = await service.refreshTokens(req.body.refreshToken);
  return reply.send({ ok: true, data: { ...tokens, expiresIn: 900 }, traceId: req.requestContext.traceId });
}

export async function logout(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as { user?: { sessionId?: string; sub?: string } }).user;
  if (user?.sessionId && user?.sub) {
    await service.logout(user.sessionId, user.sub);
  }
  return reply.send({ ok: true, data: { message: 'Logged out.' }, traceId: req.requestContext.traceId });
}
