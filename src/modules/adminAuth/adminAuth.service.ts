import * as bcrypt from 'bcrypt';
import { prisma } from '../../db/client.js';
import { issueTokenPair, verifyRefreshToken } from '../../lib/jwt.js';
import { storeOtpByKey, verifyAndConsumeOtpByKey } from '../../lib/otp.js';
import { sendEmailOtp as deliverEmailOtp } from '../../lib/email.js';
import { sendSmsOtp } from '../../lib/sms.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { verifyGoogleToken } from '../../lib/tokenVerifier.js';
import type { TokenPair } from '../../lib/jwt.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { env } from '../../config/env.js';
import type { Prisma } from '@prisma/client';

type AdminSession = TokenPair & { admin: { id: string; email: string; name: string; role: string; customPermissions: string[] } };

export async function sendEmailOtp(email: string): Promise<void> {
  const admin = await prisma.admin.findFirst({ where: { email } });
  if (!admin || !admin.isActive) return;
  const otp = await storeOtpByKey(`admin:email:${email}`, 10 * 60);
  await deliverEmailOtp(email, otp, admin.name);
}

export async function verifyEmailOtp(email: string, otp: string): Promise<AdminSession> {
  await verifyAndConsumeOtpByKey(`admin:email:${email}`, otp);
  const admin = await prisma.admin.findFirst({ where: { email } });
  if (!admin || !admin.isActive) throw new AppError('AUTH_REQUIRED', 'Account not found or inactive.', 401);
  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const pair = await issueAdminSession(admin.id);
  await writeAuditLog({ actorType: 'admin', actorId: admin.id, action: 'admin.login', summary: 'Admin login via email OTP' });
  return { ...pair, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, customPermissions: admin.customPermissions as string[] } };
}

export async function sendPhoneOtp(phone: string): Promise<void> {
  const normalised = phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;
  const admin = await prisma.admin.findFirst({ where: { phone: normalised } });
  if (!admin || !admin.isActive) return;
  const otp = await storeOtpByKey(`admin:phone:${normalised}`, 5 * 60);
  await sendSmsOtp(normalised, otp);
}

export async function verifyPhoneOtp(phone: string, otp: string): Promise<AdminSession> {
  const normalised = phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;
  await verifyAndConsumeOtpByKey(`admin:phone:${normalised}`, otp);
  const admin = await prisma.admin.findFirst({ where: { phone: normalised } });
  if (!admin || !admin.isActive) throw new AppError('AUTH_REQUIRED', 'Account not found or inactive.', 401);
  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const pair = await issueAdminSession(admin.id);
  await writeAuditLog({ actorType: 'admin', actorId: admin.id, action: 'admin.login', summary: 'Admin login via phone OTP' });
  return { ...pair, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, customPermissions: admin.customPermissions as string[] } };
}

export async function loginWithGoogle(idToken: string): Promise<AdminSession> {
  const payload = await verifyGoogleToken(idToken, env.GOOGLE_OAUTH_CLIENT_ID);
  const email = payload.email;
  if (!email) throw new AppError('AUTH_REQUIRED', 'Google token has no email.', 401);
  const admin = await prisma.admin.findFirst({ where: { email } });
  if (!admin || !admin.isActive) throw new AppError('AUTH_REQUIRED', 'No admin account for this Google account.', 401);
  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const pair = await issueAdminSession(admin.id);
  await writeAuditLog({ actorType: 'admin', actorId: admin.id, action: 'admin.login', summary: 'Admin login via Google OAuth' });
  return { ...pair, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, customPermissions: admin.customPermissions as string[] } };
}

export async function refreshAdminToken(refreshToken: string): Promise<TokenPair> {
  let payload: { sub: string; sessionId: string; jti: string };
  try {
    payload = await verifyRefreshToken(refreshToken, JWT_AUDIENCE.ADMIN);
  } catch {
    throw new AppError('AUTH_REQUIRED', 'Invalid or expired refresh token.', 401);
  }

  const session = await prisma.authSession.findFirst({
    where: { subjectId: payload.sub, audience: 'admin', sessionId: payload.sessionId },
  });

  if (!session) {
    await prisma.authSession.updateMany({
      where: { subjectId: payload.sub, audience: 'admin' },
      data: { revokedAt: new Date(), revokedReason: 'theftDetected' },
    });
    await writeAuditLog({ actorType: 'admin', actorId: payload.sub, action: 'admin.sessionTheftDetected', summary: 'Refresh token replay detected — all sessions revoked' });
    throw new AppError('AUTH_REQUIRED', 'Session invalidated. Please log in again.', 401);
  }

  if (session.revokedAt) throw new AppError('AUTH_REQUIRED', 'Session has been revoked. Please log in again.', 401);

  return prisma.$transaction(async (tx) => {
    await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokedReason: 'rotated' } });
    return issueAdminSession(payload.sub, tx);
  });
}

export async function logoutAdmin(adminId: string, sessionId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { subjectId: adminId, sessionId },
    data: { revokedAt: new Date(), revokedReason: 'logout' },
  });
  await writeAuditLog({ actorType: 'admin', actorId: adminId, action: 'admin.logout', summary: 'Admin logged out' });
}

// ─── Private helpers ─────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

async function issueAdminSession(adminId: string, tx?: Tx): Promise<TokenPair> {
  const pair = await issueTokenPair(adminId, JWT_AUDIENCE.ADMIN);
  const refreshHash = await bcrypt.hash(pair.refreshToken, 6);
  const client = tx ?? prisma;

  await client.authSession.create({
    data: {
      audience: 'admin',
      subjectId: adminId,
      sessionId: pair.sessionId,
      refreshTokenHash: refreshHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return pair;
}
