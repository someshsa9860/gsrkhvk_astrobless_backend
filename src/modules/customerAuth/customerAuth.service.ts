import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { prisma } from '../../db/client.js';
import { issueTokenPair } from '../../lib/jwt.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { storeOtp, verifyAndConsumeOtp } from '../../lib/otp.js';
import { hashPassword, comparePassword, assertPasswordStrength } from '../../lib/password.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { logger } from '../../lib/logger.js';
import { lookupIp } from '../../lib/geoip.js';
import { broadcastAdminEvent } from '../../admin/notifications/adminNotifications.routes.js';
import { getContext } from '../../lib/context.js';
import { verifyGoogleToken, verifyAppleToken } from '../../lib/tokenVerifier.js';
import { upsertAppleCredential } from '../../lib/appleCredentials.js';
import { env } from '../../config/env.js';
import type { TokenPair } from '../../lib/jwt.js';
import type { Prisma } from '@prisma/client';

export interface DeviceInfo {
  deviceId?: string;
  deviceModel?: string;
  deviceName?: string;
  osName?: string;
  osVersion?: string;
}

const PERSONA = 'customer';
const OTP_PHONE_TTL = 5 * 60;
const OTP_EMAIL_TTL = 10 * 60;

export async function sendPhoneOtp(phone: string): Promise<void> {
  const otp = await storeOtp(PERSONA, 'phone', phone, OTP_PHONE_TTL);
  logger.info({ phone: phone.slice(-4) }, 'Customer phone OTP generated');
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');
}

export async function verifyPhoneOtp(phone: string, otp: string, name?: string, ipAddress?: string): Promise<TokenPair> {
  await verifyAndConsumeOtp(PERSONA, 'phone', phone, otp);
  const geo = lookupIp(ipAddress);
  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({ where: { phone } });
    let isNew = false;

    if (!customer) {
      isNew = true;
      customer = await tx.customer.create({
        data: {
          phone,
          name: name ?? null,
          referralCode: uuidv4().slice(0, 8).toUpperCase(),
          registrationCity: geo.city,
          registrationState: geo.state,
          registrationCountry: geo.country,
          registrationCountryCode: geo.countryCode,
        },
      });
      await tx.customerAuthIdentity.create({ data: { customerId: customer.id, providerKey: 'phoneOtp', providerUserId: phone } });
      await tx.wallet.create({ data: { customerId: customer.id } });
    }

    const session = await createSession(tx, customer.id, 'customer', device);
    await writeAuditLog({
      actorType: 'customer', actorId: customer.id,
      action: isNew ? 'customer.signup' : 'customer.login',
      targetType: 'customer', targetId: customer.id,
      summary: isNew ? 'Signed up via phone OTP' : 'Login via phone OTP',
    }, tx);

    if (isNew) {
      broadcastAdminEvent('event:newSignup', {
        persona: 'customer', id: customer.id, name: customer.name ?? 'New User',
        city: geo.city, country: geo.country, countryCode: geo.countryCode,
        method: 'phoneOtp', registeredAt: new Date().toISOString(),
      });
    }

    return session;
  });
}

export async function emailSignup(email: string, password: string, name: string, ipAddress?: string): Promise<{ pendingVerification: true }> {
  assertPasswordStrength(password);

  const existing = await prisma.customerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  if (existing) throw new AppError('CONFLICT', 'An account with this email already exists.', 409);

  const passwordHash = await hashPassword(password);
  const geo = lookupIp(ipAddress);

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        email, emailVerified: false, name,
        referralCode: uuidv4().slice(0, 8).toUpperCase(),
        registrationCity: geo.city, registrationState: geo.state,
        registrationCountry: geo.country, registrationCountryCode: geo.countryCode,
      },
    });
    await tx.customerAuthIdentity.create({ data: { customerId: customer.id, providerKey: 'emailPassword', providerUserId: email, passwordHash } });
    await tx.wallet.create({ data: { customerId: customer.id } });
    await writeAuditLog({ actorType: 'customer', actorId: customer.id, action: 'customer.signup', summary: 'Signed up via email' }, tx);
  });

  const otp = await storeOtp(PERSONA, 'email', email, OTP_EMAIL_TTL);
  logger.info({ email: maskEmail(email) }, 'Customer email verification OTP sent');
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');

  return { pendingVerification: true };
}

export async function verifyEmailOtp(email: string, otp: string): Promise<TokenPair> {
  await verifyAndConsumeOtp(PERSONA, 'email', email, otp);
  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    const identity = await tx.customerAuthIdentity.findFirst({
      where: { providerKey: 'emailPassword', providerUserId: email },
    });
    if (!identity) throw new AppError('NOT_FOUND', 'Account not found.', 404);

    await tx.customer.update({ where: { id: identity.customerId }, data: { emailVerified: true } });
    await writeAuditLog({ actorType: 'customer', actorId: identity.customerId, action: 'customer.emailVerified', summary: 'Email verified' }, tx);

    return createSession(tx, identity.customerId, 'customer', device);
  });
}

export async function emailLogin(email: string, password: string): Promise<TokenPair> {
  const identity = await prisma.customerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  if (!identity || !identity.passwordHash) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const valid = await comparePassword(password, identity.passwordHash);
  if (!valid) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const customer = await prisma.customer.findFirst({ where: { id: identity.customerId } });
  if (!customer?.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email first.', 403);
  if (customer.isBlocked) throw new AppError('FORBIDDEN', 'Account is blocked.', 403);

  await prisma.customerAuthIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });

  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    await writeAuditLog({ actorType: 'customer', actorId: customer.id, action: 'customer.login', summary: 'Login via email' }, tx);
    return createSession(tx, customer.id, 'customer', device);
  });
}

export async function googleAuth(idToken: string, device?: DeviceInfo): Promise<TokenPair> {
  const payload = await verifyGoogleToken(idToken, env.GOOGLE_OAUTH_CLIENT_ID);
  const { sub, email, name, picture } = payload;

  const ctx = getContext();
  const resolvedDevice: DeviceInfo = device ?? { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    let identity = await tx.customerAuthIdentity.findFirst({
      where: { providerKey: 'google', providerUserId: sub },
    });

    let customerId: string;
    let isNew = false;

    if (identity) {
      customerId = identity.customerId;
      await tx.customerAuthIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });
    } else {
      isNew = true;
      let customer = email ? await tx.customer.findFirst({ where: { email } }) : null;

      if (!customer) {
        customer = await tx.customer.create({
          data: { email: email ?? null, emailVerified: true, name: name ?? null, profileImageUrl: picture ?? null, referralCode: uuidv4().slice(0, 8).toUpperCase() },
        });
        await tx.wallet.create({ data: { customerId: customer.id } });
      } else if (!customer.emailVerified) {
        await tx.customer.update({ where: { id: customer.id }, data: { emailVerified: true } });
      }

      await tx.customerAuthIdentity.create({ data: { customerId: customer.id, providerKey: 'google', providerUserId: sub, lastUsedAt: new Date() } });
      customerId = customer.id;

      broadcastAdminEvent('event:newSignup', { persona: 'customer', id: customer.id, name: customer.name ?? name ?? 'New User', method: 'google', registeredAt: new Date().toISOString() });
    }

    await writeAuditLog({ actorType: 'customer', actorId: customerId, action: isNew ? 'customer.signup' : 'customer.login', targetType: 'customer', targetId: customerId, summary: isNew ? 'Signed up via Google' : 'Login via Google' }, tx);
    return createSession(tx, customerId, 'customer', resolvedDevice);
  });
}

export async function appleAuth(identityToken: string, _nonce: string, name?: string, device?: DeviceInfo): Promise<TokenPair> {
  const payload = await verifyAppleToken(identityToken, env.APPLE_SERVICE_ID);
  const { sub, email } = payload;

  const storedCreds = await upsertAppleCredential(sub, email, name);
  const resolvedEmail = email ?? storedCreds.email ?? undefined;
  const resolvedName = name ?? storedCreds.name ?? undefined;

  const ctx = getContext();
  const resolvedDevice: DeviceInfo = device ?? { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    let identity = await tx.customerAuthIdentity.findFirst({
      where: { providerKey: 'apple', providerUserId: sub },
    });

    let customerId: string;
    let isNew = false;

    if (identity) {
      customerId = identity.customerId;
      await tx.customerAuthIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });
    } else {
      isNew = true;
      let customer = resolvedEmail ? await tx.customer.findFirst({ where: { email: resolvedEmail } }) : null;

      if (!customer) {
        customer = await tx.customer.create({
          data: { email: resolvedEmail ?? null, emailVerified: resolvedEmail ? true : false, name: resolvedName ?? null, appleId: sub, referralCode: uuidv4().slice(0, 8).toUpperCase() },
        });
        await tx.wallet.create({ data: { customerId: customer.id } });
      } else {
        await tx.customer.update({ where: { id: customer.id }, data: { appleId: sub, emailVerified: true } });
      }

      await tx.customerAuthIdentity.create({ data: { customerId: customer.id, providerKey: 'apple', providerUserId: sub, lastUsedAt: new Date() } });
      customerId = customer.id;

      broadcastAdminEvent('event:newSignup', { persona: 'customer', id: customer.id, name: customer.name ?? resolvedName ?? 'New User', method: 'apple', registeredAt: new Date().toISOString() });
    }

    await writeAuditLog({ actorType: 'customer', actorId: customerId, action: isNew ? 'customer.signup' : 'customer.login', targetType: 'customer', targetId: customerId, summary: isNew ? 'Signed up via Apple Sign-In' : 'Login via Apple Sign-In' }, tx);
    return createSession(tx, customerId, 'customer', resolvedDevice);
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  const { verifyRefreshToken } = await import('../../lib/jwt.js');
  let payload: { sub: string; sessionId: string; jti: string };

  try {
    payload = await verifyRefreshToken(refreshToken, JWT_AUDIENCE.CUSTOMER);
  } catch {
    throw new AppError('AUTH_REQUIRED', 'Invalid refresh token.', 401);
  }

  const session = await prisma.authSession.findFirst({
    where: { sessionId: payload.sessionId, subjectId: payload.sub, audience: 'customer' },
  });

  if (!session || session.revokedAt) {
    await prisma.authSession.updateMany({
      where: { subjectId: payload.sub, audience: 'customer', revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'theftDetected' },
    });
    throw new AppError('AUTH_REQUIRED', 'Session invalidated. Please log in again.', 401);
  }

  const ctx = getContext();
  const device: DeviceInfo = { deviceId: ctx.deviceId, deviceModel: ctx.deviceModel, deviceName: ctx.deviceName, osName: ctx.osName, osVersion: ctx.osVersion };

  return prisma.$transaction(async (tx) => {
    await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokedReason: 'rotated' } });
    return createSession(tx, payload.sub, 'customer', device);
  });
}

export async function resendEmailOtp(email: string): Promise<void> {
  const otp = await storeOtp(PERSONA, 'email', email, OTP_EMAIL_TTL);
  logger.info({ email: maskEmail(email) }, 'Customer email OTP resent');
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');
}

export async function forgotPassword(email: string): Promise<void> {
  const identity = await prisma.customerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  // Always succeed silently — never reveal whether email exists
  if (!identity) return;

  const otp = await storeOtp(PERSONA, 'email', `reset:${email}`, OTP_EMAIL_TTL);
  logger.info({ email: maskEmail(email) }, 'Customer password reset OTP sent');
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV password reset OTP');
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  await verifyAndConsumeOtp(PERSONA, 'email', `reset:${email}`, otp);
  assertPasswordStrength(newPassword);

  const identity = await prisma.customerAuthIdentity.findFirst({
    where: { providerKey: 'emailPassword', providerUserId: email },
  });
  if (!identity) throw new AppError('NOT_FOUND', 'Account not found.', 404);

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.customerAuthIdentity.update({ where: { id: identity.id }, data: { passwordHash } });
    // Revoke all existing sessions so stolen-token can't be replayed
    await tx.authSession.updateMany({
      where: { subjectId: identity.customerId, audience: 'customer', revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
    await writeAuditLog({ actorType: 'customer', actorId: identity.customerId, action: 'customer.passwordReset', summary: 'Password reset via email OTP' }, tx);
  });
}

export async function logout(sessionId: string, subjectId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, subjectId },
    data: { revokedAt: new Date(), revokedReason: 'logout' },
  });
}

// ─── Private helpers ─────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

async function createSession(tx: Tx, subjectId: string, persona: 'customer', device?: DeviceInfo): Promise<TokenPair> {
  const pair = await issueTokenPair(subjectId, JWT_AUDIENCE.CUSTOMER);
  const refreshHash = pair.refreshToken ? await bcrypt.hash(pair.refreshToken, 6) : '';

  await tx.authSession.create({
    data: {
      audience: persona,
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

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user!.slice(0, 2)}***@${domain}`;
}
