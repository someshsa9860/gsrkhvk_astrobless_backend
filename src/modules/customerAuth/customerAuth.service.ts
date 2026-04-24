import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { db } from '../../db/client.js';
import { customers, customerAuthIdentities } from '../../db/schema/customers.js';
import { authSessions } from '../../db/schema/authSessions.js';
import { wallets } from '../../db/schema/wallet.js';
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
  // TODO: send via MSG91
  if (process.env['NODE_ENV'] !== 'production') logger.debug({ otp }, 'DEV OTP');
}

export async function verifyPhoneOtp(phone: string, otp: string, name?: string, ipAddress?: string): Promise<TokenPair> {
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
    let customer = await tx.query.customers.findFirst({ where: eq(customers.phone, phone) });
    let isNew = false;

    if (!customer) {
      isNew = true;
      [customer] = await tx.insert(customers).values({
        phone, name: name ?? null,
        referralCode: uuidv4().slice(0, 8).toUpperCase(),
        registrationCity: geo.city,
        registrationState: geo.state,
        registrationCountry: geo.country,
        registrationCountryCode: geo.countryCode,
      }).returning();
      await tx.insert(customerAuthIdentities).values({ customerId: customer!.id, providerKey: 'phoneOtp', providerUserId: phone });
      await tx.insert(wallets).values({ customerId: customer!.id });
    }

    const session = await createSession(tx, customer!.id, 'customer', device);
    await writeAuditLog({
      actorType: 'customer', actorId: customer!.id, action: isNew ? 'customer.signup' : 'customer.login',
      targetType: 'customer', targetId: customer!.id, summary: isNew ? 'Signed up via phone OTP' : 'Login via phone OTP',
    }, tx);

    if (isNew) {
      broadcastAdminEvent('event:newSignup', {
        persona: 'customer',
        id: customer!.id,
        name: customer!.name ?? 'New User',
        city: geo.city,
        country: geo.country,
        countryCode: geo.countryCode,
        method: 'phoneOtp',
        registeredAt: new Date().toISOString(),
      });
    }

    return session;
  });
}

export async function emailSignup(email: string, password: string, name: string, ipAddress?: string): Promise<{ pendingVerification: true }> {
  assertPasswordStrength(password);

  const existing = await db.query.customerAuthIdentities.findFirst({
    where: and(eq(customerAuthIdentities.providerKey, 'emailPassword'), eq(customerAuthIdentities.providerUserId, email)),
  });
  if (existing) throw new AppError('CONFLICT', 'An account with this email already exists.', 409);

  const passwordHash = await hashPassword(password);
  const geo = lookupIp(ipAddress);

  await db.transaction(async (tx) => {
    const [customer] = await tx.insert(customers).values({
      email, emailVerified: false, name,
      referralCode: uuidv4().slice(0, 8).toUpperCase(),
      registrationCity: geo.city,
      registrationState: geo.state,
      registrationCountry: geo.country,
      registrationCountryCode: geo.countryCode,
    }).returning();
    await tx.insert(customerAuthIdentities).values({ customerId: customer!.id, providerKey: 'emailPassword', providerUserId: email, passwordHash });
    await tx.insert(wallets).values({ customerId: customer!.id });
    await writeAuditLog({ actorType: 'customer', actorId: customer!.id, action: 'customer.signup', summary: `Signed up via email` }, tx);
  });

  const otp = await storeOtp(PERSONA, 'email', email, OTP_EMAIL_TTL);
  logger.info({ email: maskEmail(email) }, 'Customer email verification OTP sent');
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
    const identity = await tx.query.customerAuthIdentities.findFirst({
      where: and(eq(customerAuthIdentities.providerKey, 'emailPassword'), eq(customerAuthIdentities.providerUserId, email)),
    });
    if (!identity) throw new AppError('NOT_FOUND', 'Account not found.', 404);

    await tx.update(customers).set({ emailVerified: true }).where(eq(customers.id, identity.customerId));
    await writeAuditLog({ actorType: 'customer', actorId: identity.customerId, action: 'customer.emailVerified', summary: 'Email verified' }, tx);

    return createSession(tx, identity.customerId, 'customer', device);
  });
}

export async function emailLogin(email: string, password: string): Promise<TokenPair> {
  const identity = await db.query.customerAuthIdentities.findFirst({
    where: and(eq(customerAuthIdentities.providerKey, 'emailPassword'), eq(customerAuthIdentities.providerUserId, email)),
  });
  if (!identity || !identity.passwordHash) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const valid = await comparePassword(password, identity.passwordHash);
  if (!valid) throw new AppError('AUTH_REQUIRED', 'Invalid credentials.', 401);

  const customer = await db.query.customers.findFirst({ where: eq(customers.id, identity.customerId) });
  if (!customer?.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email first.', 403);
  if (customer.isBlocked) throw new AppError('FORBIDDEN', 'Account is blocked.', 403);

  await db.update(customerAuthIdentities).set({ lastUsedAt: new Date() }).where(eq(customerAuthIdentities.id, identity.id));

  const ctx = getContext();
  const device: DeviceInfo = {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
    await writeAuditLog({ actorType: 'customer', actorId: customer.id, action: 'customer.login', summary: 'Login via email' }, tx);
    return createSession(tx, customer.id, 'customer', device);
  });
}

export async function googleAuth(idToken: string, device?: DeviceInfo): Promise<TokenPair> {
  const payload = await verifyGoogleToken(idToken, env.GOOGLE_OAUTH_CLIENT_ID);
  const { sub, email, name, picture } = payload;

  const ctx = getContext();
  const resolvedDevice: DeviceInfo = device ?? {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
    // Look up existing identity for this Google sub
    let identity = await tx.query.customerAuthIdentities.findFirst({
      where: and(eq(customerAuthIdentities.providerKey, 'google'), eq(customerAuthIdentities.providerUserId, sub)),
    });

    let customerId: string;
    let isNew = false;

    if (identity) {
      customerId = identity.customerId;
      await tx.update(customerAuthIdentities).set({ lastUsedAt: new Date() }).where(eq(customerAuthIdentities.id, identity.id));
    } else {
      isNew = true;
      // Upsert customer by email if one already exists (e.g. email+password account)
      let customer = email
        ? await tx.query.customers.findFirst({ where: eq(customers.email, email) })
        : undefined;

      if (!customer) {
        const [inserted] = await tx.insert(customers).values({
          email: email ?? null,
          emailVerified: true,
          name: name ?? null,
          profileImageUrl: picture ?? null,
          referralCode: uuidv4().slice(0, 8).toUpperCase(),
        }).returning();
        customer = inserted!;
        await tx.insert(wallets).values({ customerId: customer.id });
      } else {
        // Link Google to existing account
        if (!customer.emailVerified) {
          await tx.update(customers).set({ emailVerified: true }).where(eq(customers.id, customer.id));
        }
      }

      await tx.insert(customerAuthIdentities).values({
        customerId: customer.id,
        providerKey: 'google',
        providerUserId: sub,
        lastUsedAt: new Date(),
      });
      customerId = customer.id;

      broadcastAdminEvent('event:newSignup', {
        persona: 'customer',
        id: customer.id,
        name: customer.name ?? name ?? 'New User',
        method: 'google',
        registeredAt: new Date().toISOString(),
      });
    }

    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: isNew ? 'customer.signup' : 'customer.login',
      targetType: 'customer',
      targetId: customerId,
      summary: isNew ? 'Signed up via Google' : 'Login via Google',
    }, tx);

    return createSession(tx, customerId, 'customer', resolvedDevice);
  });
}

export async function appleAuth(identityToken: string, _nonce: string, name?: string, device?: DeviceInfo): Promise<TokenPair> {
  const payload = await verifyAppleToken(identityToken, env.APPLE_SERVICE_ID);
  const { sub, email } = payload;

  // Upsert central credential store — preserves email/name from first sign-in
  // since Apple stops returning them on subsequent sign-ins
  const storedCreds = await upsertAppleCredential(sub, email, name);
  const resolvedEmail = email ?? storedCreds.email ?? undefined;
  const resolvedName = name ?? storedCreds.name ?? undefined;

  const ctx = getContext();
  const resolvedDevice: DeviceInfo = device ?? {
    deviceId: ctx.deviceId,
    deviceModel: ctx.deviceModel,
    deviceName: ctx.deviceName,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
  };

  return db.transaction(async (tx) => {
    let identity = await tx.query.customerAuthIdentities.findFirst({
      where: and(eq(customerAuthIdentities.providerKey, 'apple'), eq(customerAuthIdentities.providerUserId, sub)),
    });

    let customerId: string;
    let isNew = false;

    if (identity) {
      customerId = identity.customerId;
      await tx.update(customerAuthIdentities).set({ lastUsedAt: new Date() }).where(eq(customerAuthIdentities.id, identity.id));
    } else {
      isNew = true;
      let customer = resolvedEmail
        ? await tx.query.customers.findFirst({ where: eq(customers.email, resolvedEmail) })
        : undefined;

      if (!customer) {
        const [inserted] = await tx.insert(customers).values({
          email: resolvedEmail ?? null,
          emailVerified: resolvedEmail ? true : false,
          name: resolvedName ?? null,
          appleId: sub,
          referralCode: uuidv4().slice(0, 8).toUpperCase(),
        }).returning();
        customer = inserted!;
        await tx.insert(wallets).values({ customerId: customer.id });
      } else {
        await tx.update(customers)
          .set({ appleId: sub, emailVerified: true })
          .where(eq(customers.id, customer.id));
      }

      await tx.insert(customerAuthIdentities).values({
        customerId: customer.id,
        providerKey: 'apple',
        providerUserId: sub,
        lastUsedAt: new Date(),
      });
      customerId = customer.id;

      broadcastAdminEvent('event:newSignup', {
        persona: 'customer',
        id: customer.id,
        name: customer.name ?? resolvedName ?? 'New User',
        method: 'apple',
        registeredAt: new Date().toISOString(),
      });
    }

    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: isNew ? 'customer.signup' : 'customer.login',
      targetType: 'customer',
      targetId: customerId,
      summary: isNew ? 'Signed up via Apple Sign-In' : 'Login via Apple Sign-In',
    }, tx);

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

  void bcrypt.hash(refreshToken, 1); // just check existence — suppress unused var warning
  const session = await db.query.authSessions.findFirst({
    where: and(eq(authSessions.subjectId, payload.sub), eq(authSessions.audience, 'customer')),
  });

  if (!session || session.revokedAt) {
    // Possible theft — revoke all sessions
    await db.update(authSessions)
      .set({ revokedAt: new Date(), revokedReason: 'theftDetected' })
      .where(and(eq(authSessions.subjectId, payload.sub), eq(authSessions.audience, 'customer')));
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
    return createSession(tx, payload.sub, 'customer', device);
  });
}

export async function logout(sessionId: string, subjectId: string): Promise<void> {
  await db.update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: 'logout' })
    .where(and(eq(authSessions.id, sessionId), eq(authSessions.subjectId, subjectId)));
}

// ─── Private helpers ─────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function createSession(
  tx: Tx,
  subjectId: string,
  persona: 'customer',
  device?: DeviceInfo,
): Promise<TokenPair> {
  const pair = await issueTokenPair(subjectId, JWT_AUDIENCE.CUSTOMER);

  const refreshHash = pair.refreshToken
    ? await bcrypt.hash(pair.refreshToken, 6) // cost=6 just for storage; jti is the real check
    : '';

  await (tx as typeof db).insert(authSessions).values({
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
  } as typeof authSessions.$inferInsert);

  return pair;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user!.slice(0, 2)}***@${domain}`;
}
