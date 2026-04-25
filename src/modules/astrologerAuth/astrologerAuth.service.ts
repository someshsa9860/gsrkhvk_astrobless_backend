import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../db/client.js';
import { issueTokenPair, verifyRefreshToken } from '../../lib/jwt.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { storeOtp, verifyAndConsumeOtp } from '../../lib/otp.js';
import { hashPassword, comparePassword, assertPasswordStrength } from '../../lib/password.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { logger } from '../../lib/logger.js';
import { lookupIp } from '../../lib/geoip.js';
import { broadcastAdminEvent } from '../../admin/notifications/adminNotifications.routes.js';
import { getContext } from '../../lib/context.js';
import { verifyAppleToken } from '../../lib/tokenVerifier.js';
import { upsertAppleCredential } from '../../lib/appleCredentials.js';
import { env } from '../../config/env.js';
import type { TokenPair } from '../../lib/jwt.js';
import type { DeviceInfo } from '../customerAuth/customerAuth.service.js';
import type { Prisma } from '@prisma/client';

const PERSONA = 'astrologer';
const OTP_PHONE_TTL = 5 * 60;
const OTP_EMAIL_TTL = 10 * 60;

export async function sendPhoneOtp(phone: string): Promise<void> {
  const otp = await storeOtp(PERSONA, 'phone', phone, OTP_PHONE_TTL);
  logger.info({ phone: phone.slice(-4) }, 'Astrologer phone OTP generated');
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');
}

export async function verifyPhoneOtp(phone: string, otp: string, displayName?: string, ipAddress?: string): Promise<TokenPair> {
  await verifyAndConsumeOtp(PERSONA, 'phone', phone, otp);
  const geo = lookupIp(ipAddress);
  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    let astrologer = await tx.astrologer.findFirst({ where: { phone } });
    let isNew = false;

    if (!astrologer) {
      isNew = true;
      astrologer = await tx.astrologer.create({
        data: {
          phone, displayName: displayName ?? 'Astrologer',
          pricePerMinChat: 10, pricePerMinCall: 15, pricePerMinVideo: 20,
          registrationCity: geo.city, registrationState: geo.state,
          registrationCountry: geo.country, registrationCountryCode: geo.countryCode,
        },
      });
      await tx.astrologerAuthIdentity.create({ data: { astrologerId: astrologer.id, providerKey: 'phoneOtp', providerUserId: phone } });
    }

    await writeAuditLog({ actorType: 'astrologer', actorId: astrologer.id, action: isNew ? 'astrologer.signup' : 'astrologer.login', summary: isNew ? 'Signed up via phone OTP' : 'Login via phone OTP' }, tx);

    if (isNew) {
      broadcastAdminEvent('event:newSignup', { persona: 'astrologer', id: astrologer.id, name: astrologer.displayName, city: geo.city, country: geo.country, countryCode: geo.countryCode, method: 'phoneOtp', registeredAt: new Date().toISOString() });
    }

    return createSession(tx, astrologer.id, device);
  });
}

export async function emailSignup(email: string, password: string, displayName: string, phone?: string, ipAddress?: string): Promise<{ pendingVerification: true }> {
  assertPasswordStrength(password);

  const existing = await prisma.astrologerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  if (existing) throw new AppError('CONFLICT', 'An account with this email already exists.', 409);

  const passwordHash = await hashPassword(password);
  const geo = lookupIp(ipAddress);

  await prisma.$transaction(async (tx) => {
    const astrologer = await tx.astrologer.create({
      data: {
        email, emailVerified: false, displayName, phone: phone ?? null,
        pricePerMinChat: 10, pricePerMinCall: 15, pricePerMinVideo: 20,
        registrationCity: geo.city, registrationState: geo.state,
        registrationCountry: geo.country, registrationCountryCode: geo.countryCode,
      },
    });
    await tx.astrologerAuthIdentity.create({ data: { astrologerId: astrologer.id, providerKey: 'emailPassword', providerUserId: email, passwordHash } });
    await writeAuditLog({ actorType: 'astrologer', actorId: astrologer.id, action: 'astrologer.signup', summary: 'Signed up via email' }, tx);
  });

  const otp = await storeOtp(PERSONA, 'email', email, OTP_EMAIL_TTL);
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');

  return { pendingVerification: true };
}

export async function verifyEmailOtp(email: string, otp: string): Promise<TokenPair> {
  await verifyAndConsumeOtp(PERSONA, 'email', email, otp);
  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    const identity = await tx.astrologerAuthIdentity.findFirst({
      where: { providerKey: 'emailPassword', providerUserId: email },
    });
    if (!identity) throw new AppError('NOT_FOUND', 'Account not found.', 404);

    await tx.astrologer.update({ where: { id: identity.astrologerId }, data: { emailVerified: true } });
    await writeAuditLog({ actorType: 'astrologer', actorId: identity.astrologerId, action: 'astrologer.emailVerified', summary: 'Email verified' }, tx);
    return createSession(tx, identity.astrologerId, device);
  });
}

export async function emailLogin(email: string, password: string): Promise<TokenPair> {
  const identity = await prisma.astrologerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  if (!identity || !identity.passwordHash) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const valid = await comparePassword(password, identity.passwordHash);
  if (!valid) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const astrologer = await prisma.astrologer.findFirst({ where: { id: identity.astrologerId } });
  if (!astrologer?.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email first.', 403);
  if (astrologer.isBlocked) throw new AppError('FORBIDDEN', 'Account is blocked.', 403);

  await prisma.astrologerAuthIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });

  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    await writeAuditLog({ actorType: 'astrologer', actorId: astrologer.id, action: 'astrologer.login', summary: 'Login via email' }, tx);
    return createSession(tx, astrologer.id, device);
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  let payload: { sub: string; sessionId: string; jti: string };
  try {
    payload = await verifyRefreshToken(refreshToken, JWT_AUDIENCE.ASTROLOGER);
  } catch {
    throw new AppError('AUTH_REQUIRED', 'Invalid refresh token.', 401);
  }

  const session = await prisma.authSession.findFirst({
    where: { sessionId: payload.sessionId, subjectId: payload.sub, audience: 'astrologer' },
  });

  if (!session || session.revokedAt) {
    await prisma.authSession.updateMany({
      where: { subjectId: payload.sub, audience: 'astrologer', revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'theftDetected' },
    });
    throw new AppError('AUTH_REQUIRED', 'Session invalidated. Please log in again.', 401);
  }

  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokedReason: 'rotated' } });
    return createSession(tx, payload.sub, device);
  });
}

export async function appleAuth(identityToken: string, _nonce: string, displayName?: string, device?: DeviceInfo): Promise<TokenPair> {
  const payload = await verifyAppleToken(identityToken, env.APPLE_SERVICE_ID);
  const { sub, email } = payload;

  const storedCreds = await upsertAppleCredential(sub, email, displayName);
  const resolvedEmail = email ?? storedCreds.email ?? undefined;
  const resolvedDisplayName = displayName ?? storedCreds.name ?? undefined;

  const ctx = getContext();
  const resolvedDevice: DeviceInfo = device ?? { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    let identity = await tx.astrologerAuthIdentity.findFirst({
      where: { providerKey: 'apple', providerUserId: sub },
    });

    let astrologerId: string;
    let isNew = false;

    if (identity) {
      astrologerId = identity.astrologerId;
      await tx.astrologerAuthIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });
    } else {
      isNew = true;
      let astrologer = resolvedEmail ? await tx.astrologer.findFirst({ where: { email: resolvedEmail } }) : null;

      if (!astrologer) {
        astrologer = await tx.astrologer.create({
          data: { email: resolvedEmail ?? null, emailVerified: resolvedEmail ? true : false, displayName: resolvedDisplayName ?? 'Astrologer', appleId: sub, pricePerMinChat: 10, pricePerMinCall: 15, pricePerMinVideo: 20 },
        });
      } else {
        await tx.astrologer.update({ where: { id: astrologer.id }, data: { appleId: sub, emailVerified: true } });
      }

      await tx.astrologerAuthIdentity.create({ data: { astrologerId: astrologer.id, providerKey: 'apple', providerUserId: sub, lastUsedAt: new Date() } });
      astrologerId = astrologer.id;

      broadcastAdminEvent('event:newSignup', { persona: 'astrologer', id: astrologer.id, name: astrologer.displayName ?? resolvedDisplayName ?? 'Astrologer', method: 'apple', registeredAt: new Date().toISOString() });
    }

    await writeAuditLog({ actorType: 'astrologer', actorId: astrologerId, action: isNew ? 'astrologer.signup' : 'astrologer.login', targetType: 'astrologer', targetId: astrologerId, summary: isNew ? 'Signed up via Apple Sign-In' : 'Login via Apple Sign-In' }, tx);
    return createSession(tx, astrologerId, resolvedDevice);
  });
}

export async function resendEmailOtp(email: string): Promise<void> {
  const otp = await storeOtp(PERSONA, 'email', email, OTP_EMAIL_TTL);
  logger.info({ email: maskEmail(email) }, 'Astrologer email OTP resent');
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');
}

export async function forgotPassword(email: string): Promise<void> {
  const identity = await prisma.astrologerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  // Always succeed silently — never reveal whether email exists
  if (!identity) return;

  const otp = await storeOtp(PERSONA, 'email', `reset:${email}`, OTP_EMAIL_TTL);
  logger.info({ email: maskEmail(email) }, 'Astrologer password reset OTP sent');
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV password reset OTP');
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  await verifyAndConsumeOtp(PERSONA, 'email', `reset:${email}`, otp);
  assertPasswordStrength(newPassword);

  const identity = await prisma.astrologerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  if (!identity) throw new AppError('NOT_FOUND', 'Account not found.', 404);

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.astrologerAuthIdentity.update({ where: { id: identity.id }, data: { passwordHash } });
    await tx.authSession.updateMany({
      where: { subjectId: identity.astrologerId, audience: 'astrologer', revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
    await writeAuditLog({ actorType: 'astrologer', actorId: identity.astrologerId, action: 'astrologer.passwordReset', summary: 'Password reset via email OTP' }, tx);
  });
}

export async function logout(sessionId: string, subjectId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, subjectId },
    data: { revokedAt: new Date(), revokedReason: 'logout' },
  });
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user!.slice(0, 2)}***@${domain}`;
}

type Tx = Prisma.TransactionClient;

async function createSession(tx: Tx, subjectId: string, device?: DeviceInfo): Promise<TokenPair> {
  const pair = await issueTokenPair(subjectId, JWT_AUDIENCE.ASTROLOGER);
  const refreshHash = pair.refreshToken ? await bcrypt.hash(pair.refreshToken, 6) : '';

  await tx.authSession.create({
    data: {
      audience: 'astrologer',
      subjectId,
      refreshTokenHash: refreshHash,
      sessionId: pair.sessionId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceId: device?.deviceId ?? null,
      deviceModel: device?.deviceModel ?? null,
      deviceName: device?.deviceName ?? null,
      osName: device?.osName ?? null,
      osVersion: device?.osVersion ?? null,
    },
  });

  return pair;
}
