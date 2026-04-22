import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './adminAuth.service.js';
import type {
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
import type { z } from 'zod';

export async function sendEmailOtp(
  req: FastifyRequest<{ Body: z.infer<typeof AdminSendEmailOtpSchema> }>,
  reply: FastifyReply,
) {
  // Always responds ok=true — prevents account enumeration.
  await service.sendEmailOtp(req.body.email);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}

export async function verifyEmailOtp(
  req: FastifyRequest<{ Body: z.infer<typeof AdminVerifyEmailOtpSchema> }>,
  reply: FastifyReply,
) {
  const result = await service.verifyEmailOtp(req.body.email, req.body.otp);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function loginWithGoogle(
  req: FastifyRequest<{ Body: z.infer<typeof AdminGoogleLoginSchema> }>,
  reply: FastifyReply,
) {
  const result = await service.loginWithGoogle(req.body.idToken);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function verifyTotp(
  req: FastifyRequest<{ Body: z.infer<typeof AdminTotpSchema> }>,
  reply: FastifyReply,
) {
  const tokens = await service.adminVerifyTotp(req.body.tempToken, req.body.code);
  return reply.send({ ok: true, data: tokens, traceId: req.requestContext.traceId });
}

export async function beginEnrollment(
  req: FastifyRequest<{ Body: z.infer<typeof AdminEnrollTotpSchema> }>,
  reply: FastifyReply,
) {
  const result = await service.beginTotpEnrollment(req.body.tempToken);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function confirmEnrollment(
  req: FastifyRequest<{ Body: z.infer<typeof AdminConfirmTotpEnrollSchema> }>,
  reply: FastifyReply,
) {
  const tokens = await service.confirmTotpEnrollment(req.body.tempToken, req.body.code);
  return reply.send({ ok: true, data: tokens, traceId: req.requestContext.traceId });
}

export async function refresh(
  req: FastifyRequest<{ Body: z.infer<typeof AdminRefreshSchema> }>,
  reply: FastifyReply,
) {
  const pair = await service.refreshAdminToken(req.body.refreshToken);
  return reply.send({ ok: true, data: pair, traceId: req.requestContext.traceId });
}

export async function sendPhoneOtp(
  req: FastifyRequest<{ Body: z.infer<typeof AdminSendPhoneOtpSchema> }>,
  reply: FastifyReply,
) {
  await service.sendPhoneOtp(req.body.phone);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}

export async function verifyPhoneOtp(
  req: FastifyRequest<{ Body: z.infer<typeof AdminVerifyPhoneOtpSchema> }>,
  reply: FastifyReply,
) {
  const result = await service.verifyPhoneOtp(req.body.phone, req.body.otp);
  return reply.send({ ok: true, data: result, traceId: req.requestContext.traceId });
}

export async function skipTotp(
  req: FastifyRequest<{ Body: z.infer<typeof AdminSkipTotpSchema> }>,
  reply: FastifyReply,
) {
  const tokens = await service.skipTotp(req.body.tempToken);
  return reply.send({ ok: true, data: tokens, traceId: req.requestContext.traceId });
}

export async function logout(
  req: FastifyRequest<{ Body: z.infer<typeof AdminLogoutSchema> }>,
  reply: FastifyReply,
) {
  const adminId = (req as unknown as Record<string, unknown>)['user'] as { sub: string } | undefined;
  await service.logoutAdmin(adminId?.sub ?? '', req.body.sessionId);
  return reply.send({ ok: true, traceId: req.requestContext.traceId });
}
