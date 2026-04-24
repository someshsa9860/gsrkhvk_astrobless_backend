import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { db } from '../../db/client.js';
import { astrologers, astrologerAuthIdentities } from '../../db/schema/astrologers.js';
import { authSessions } from '../../db/schema/authSessions.js';
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
  const device: DeviceInfo = {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
    let astrologer = await tx.query.astrologers.findFirst({ where: eq(astrologers.phone, phone) });
    let isNew = false;

    if (!astrologer) {
      isNew = true;
      [astrologer] = await tx.insert(astrologers).values({
        phone,
        displayName: displayName ?? 'Astrologer',
        pricePerMinChat: 1000,
        pricePerMinCall: 1500,
        pricePerMinVideo: 2000,
        registrationCity: geo.city,
        registrationState: geo.state,
        registrationCountry: geo.country,
        registrationCountryCode: geo.countryCode,
      }).returning();
      await tx.insert(astrologerAuthIdentities).values({ astrologerId: astrologer!.id, providerKey: 'phoneOtp', providerUserId: phone });
    }

    await writeAuditLog({ actorType: 'astrologer', actorId: astrologer!.id, action: isNew ? 'astrologer.signup' : 'astrologer.login', summary: isNew ? 'Signed up via phone OTP' : 'Login via phone OTP' }, tx);

    if (isNew) {
      broadcastAdminEvent('event:newSignup', {
        persona: 'astrologer',
        id: astrologer!.id,
        name: astrologer!.displayName,
        city: geo.city,
        country: geo.country,
        countryCode: geo.countryCode,
        method: 'phoneOtp',
        registeredAt: new Date().toISOString(),
      });
    }

    return createSession(tx, astrologer!.id, device);
  });
}

export async function emailSignup(email: string, password: string, displayName: string, phone?: string, ipAddress?: string): Promise<{ pendingVerification: true }> {
  assertPasswordStrength(password);

  const existing = await db.query.astrologerAuthIdentities.findFirst({
    where: and(eq(astrologerAuthIdentities.providerKey, 'emailPassword'), eq(astrologerAuthIdentities.providerUserId, email)),
  });
  if (existing) throw new AppError('CONFLICT', 'An account with this email already exists.', 409);

  const passwordHash = await hashPassword(password);
  const geo = lookupIp(ipAddress);

  await db.transaction(async (tx) => {
    const [astrologer] = await tx.insert(astrologers).values({
      email,
      emailVerified: false,
      displayName,
      phone: phone ?? null,
      pricePerMinChat: 1000,
      pricePerMinCall: 1500,
      pricePerMinVideo: 2000,
      registrationCity: geo.city,
      registrationState: geo.state,
      registrationCountry: geo.country,
      registrationCountryCode: geo.countryCode,
    }).returning();
    await tx.insert(astrologerAuthIdentities).values({ astrologerId: astrologer!.id, providerKey: 'emailPassword', providerUserId: email, passwordHash });
    await writeAuditLog({ actorType: 'astrologer', actorId: astrologer!.id, action: 'astrologer.signup', summary: 'Signed up via email' }, tx);
  });

  const otp = await storeOtp(PERSONA, 'email', email, OTP_EMAIL_TTL);
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');

  return { pendingVerification: true };
}

export async function verifyEmailOtp(email: string, otp: string): Promise<TokenPair> {
  await verifyAndConsumeOtp(PERSONA, 'email', email, otp);
  const ctx = getContext();
  const device: DeviceInfo = {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
    const identity = await tx.query.astrologerAuthIdentities.findFirst({
      where: and(eq(astrologerAuthIdentities.providerKey, 'emailPassword'), eq(astrologerAuthIdentities.providerUserId, email)),
    });
    if (!identity) throw new AppError('NOT_FOUND', 'Account not found.', 404);

    await tx.update(astrologers).set({ emailVerified: true }).where(eq(astrologers.id, identity.astrologerId));
    await writeAuditLog({ actorType: 'astrologer', actorId: identity.astrologerId, action: 'astrologer.emailVerified', summary: 'Email verified' }, tx);

    return createSession(tx, identity.astrologerId, device);
  });
}

export async function emailLogin(email: string, password: string): Promise<TokenPair> {
  const identity = await db.query.astrologerAuthIdentities.findFirst({
    where: and(eq(astrologerAuthIdentities.providerKey, 'emailPassword'), eq(astrologerAuthIdentities.providerUserId, email)),
  });
  if (!identity || !identity.passwordHash) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const valid = await comparePassword(password, identity.passwordHash);
  if (!valid) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const astrologer = await db.query.astrologers.findFirst({ where: eq(astrologers.id, identity.astrologerId) });
  if (!astrologer?.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email first.', 403);
  if (astrologer.isBlocked) throw new AppError('FORBIDDEN', 'Account is blocked.', 403);

  await db.update(astrologerAuthIdentities).set({ lastUsedAt: new Date() }).where(eq(astrologerAuthIdentities.id, identity.id));

  const ctx = getContext();
  const device: DeviceInfo = {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
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

  const session = await db.query.authSessions.findFirst({
    where: and(eq(authSessions.subjectId, payload.sub), eq(authSessions.audience, 'astrologer')),
  });

  if (!session || session.revokedAt) {
    await db.update(authSessions)
      .set({ revokedAt: new Date(), revokedReason: 'theftDetected' })
      .where(and(eq(authSessions.subjectId, payload.sub), eq(authSessions.audience, 'astrologer')));
    throw new AppError('AUTH_REQUIRED', 'Session invalidated. Please log in again.', 401);
  }

  const ctx = getContext();
  const device: DeviceInfo = {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
    await tx.update(authSessions).set({ revokedAt: new Date(), revokedReason: 'rotated' }).where(eq(authSessions.id, session.id));
    return createSession(tx, payload.sub, device);
  });
}

export async function appleAuth(identityToken: string, _nonce: string, displayName?: string, device?: DeviceInfo): Promise<TokenPair> {
  const payload = await verifyAppleToken(identityToken, env.APPLE_SERVICE_ID);
  const { sub, email } = payload;

  // Upsert central credential store — preserves email/name from first sign-in
  const storedCreds = await upsertAppleCredential(sub, email, displayName);
  const resolvedEmail = email ?? storedCreds.email ?? undefined;
  const resolvedDisplayName = displayName ?? storedCreds.name ?? undefined;

  const ctx = getContext();
  const resolvedDevice: DeviceInfo = device ?? {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
    let identity = await tx.query.astrologerAuthIdentities.findFirst({
      where: and(eq(astrologerAuthIdentities.providerKey, 'apple'), eq(astrologerAuthIdentities.providerUserId, sub)),
    });

    let astrologerId: string;
    let isNew = false;

    if (identity) {
      astrologerId = identity.astrologerId;
      await tx.update(astrologerAuthIdentities).set({ lastUsedAt: new Date() }).where(eq(astrologerAuthIdentities.id, identity.id));
    } else {
      isNew = true;
      let astrologer = resolvedEmail
        ? await tx.query.astrologers.findFirst({ where: eq(astrologers.email, resolvedEmail) })
        : undefined;

      if (!astrologer) {
        const [inserted] = await tx.insert(astrologers).values({
          email: resolvedEmail ?? null,
          emailVerified: resolvedEmail ? true : false,
          displayName: resolvedDisplayName ?? 'Astrologer',
          appleId: sub,
          pricePerMinChat: 1000,
          pricePerMinCall: 1500,
          pricePerMinVideo: 2000,
        }).returning();
        astrologer = inserted!;
      } else {
        await tx.update(astrologers)
          .set({ appleId: sub, emailVerified: true })
          .where(eq(astrologers.id, astrologer.id));
      }

      await tx.insert(astrologerAuthIdentities).values({
        astrologerId: astrologer.id,
        providerKey: 'apple',
        providerUserId: sub,
        lastUsedAt: new Date(),
      });
      astrologerId = astrologer.id;

      broadcastAdminEvent('event:newSignup', {
        persona: 'astrologer',
        id: astrologer.id,
        name: astrologer.displayName ?? resolvedDisplayName ?? 'Astrologer',
        method: 'apple',
        registeredAt: new Date().toISOString(),
      });
    }

    await writeAuditLog({
      actorType: 'astrologer',
      actorId: astrologerId,
      action: isNew ? 'astrologer.signup' : 'astrologer.login',
      targetType: 'astrologer',
      targetId: astrologerId,
      summary: isNew ? 'Signed up via Apple Sign-In' : 'Login via Apple Sign-In',
    }, tx);

    return createSession(tx, astrologerId, resolvedDevice);
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function createSession(tx: Tx, subjectId: string, device?: DeviceInfo): Promise<TokenPair> {
  const pair = await issueTokenPair(subjectId, JWT_AUDIENCE.ASTROLOGER);
  const refreshHash = pair.refreshToken ? await bcrypt.hash(pair.refreshToken, 6) : '';

  await (tx as typeof db).insert(authSessions).values({
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
  } as typeof authSessions.$inferInsert);

  return pair;
}
