import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { db } from '../../db/client.js';
import { admins } from '../../db/schema/admins.js';
import { authSessions } from '../../db/schema/authSessions.js';
import { issueTokenPair, verifyRefreshToken } from '../../lib/jwt.js';
import { storeOtpByKey, verifyAndConsumeOtpByKey } from '../../lib/otp.js';
import { sendEmailOtp as deliverEmailOtp } from '../../lib/email.js';
import { sendSmsOtp } from '../../lib/sms.js';
import { setTempToken, getTempToken, deleteTempToken, adminTempTokenKey } from '../../lib/redis.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { TokenPair } from '../../lib/jwt.js';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { env } from '../../config/env.js';

const TEMP_TOKEN_TTL = 5 * 60; // 5 min — covers the time to complete TOTP step

// ── Email OTP ─────────────────────────────────────────────────────────────────

// Sends a 6-digit OTP to the admin's email. Does NOT reveal whether the email exists
// (prevents account enumeration — always returns { ok: true }).
export async function sendEmailOtp(email: string): Promise<void> {
  const admin = await db.query.admins.findFirst({ where: eq(admins.email, email) });
  // Silently skip unknown emails — prevents account enumeration attacks.
  if (!admin || !admin.isActive) return;

  const otp = await storeOtpByKey(`admin:email:${email}`, 10 * 60); // 10 min TTL
  await deliverEmailOtp(email, otp, admin.name);
}

// Verifies the OTP. On success returns a tempToken scoped to the TOTP step.
export async function verifyEmailOtp(email: string, otp: string): Promise<{ tempToken: string; requiresTotpEnrollment: boolean }> {
  await verifyAndConsumeOtpByKey(`admin:email:${email}`, otp); // throws OTP_INVALID/OTP_EXPIRED on failure

  const admin = await db.query.admins.findFirst({ where: eq(admins.email, email) });
  if (!admin || !admin.isActive) throw new AppError('AUTH_REQUIRED', 'Account not found or inactive.', 401);

  const tempToken = uuidv4();
  await setTempToken(adminTempTokenKey(tempToken), admin.id, TEMP_TOKEN_TTL);

  return { tempToken, requiresTotpEnrollment: !admin.totpEnrolled };
}

// ── Phone OTP ─────────────────────────────────────────────────────────────────

// Sends a 6-digit OTP to the admin's registered phone number.
// Always returns ok (prevents enumeration).
export async function sendPhoneOtp(phone: string): Promise<void> {
  const normalised = phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;
  const admin = await db.query.admins.findFirst({ where: eq(admins.phone, normalised) });
  if (!admin || !admin.isActive) return; // silently skip — prevents enumeration

  const otp = await storeOtpByKey(`admin:phone:${normalised}`, 5 * 60); // 5 min TTL
  await sendSmsOtp(normalised, otp);
}

// Verifies the phone OTP. On success returns a tempToken scoped to the TOTP step.
export async function verifyPhoneOtp(phone: string, otp: string): Promise<{ tempToken: string; requiresTotpEnrollment: boolean }> {
  const normalised = phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;
  await verifyAndConsumeOtpByKey(`admin:phone:${normalised}`, otp);

  const admin = await db.query.admins.findFirst({ where: eq(admins.phone, normalised) });
  if (!admin || !admin.isActive) throw new AppError('AUTH_REQUIRED', 'Account not found or inactive.', 401);

  const tempToken = uuidv4();
  await setTempToken(adminTempTokenKey(tempToken), admin.id, TEMP_TOKEN_TTL);

  return { tempToken, requiresTotpEnrollment: !admin.totpEnrolled };
}

// ── Skip TOTP (optional — only when not yet enrolled) ─────────────────────────

// Issues a full session without the TOTP step. Only valid if totpEnrolled=false.
// Once enrolled, TOTP cannot be skipped — this endpoint throws FORBIDDEN.
export async function skipTotp(tempToken: string): Promise<TokenPair & { admin: { id: string; email: string; name: string; role: string; customPermissions: string[] } }> {
  const adminId = await getTempToken(adminTempTokenKey(tempToken));
  if (!adminId) throw new AppError('AUTH_REQUIRED', 'Temp token expired. Please log in again.', 401);

  const admin = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!admin) throw new AppError('AUTH_REQUIRED', 'Admin not found.', 401);

  // Cannot skip TOTP once enrolled — would bypass 2FA.
  if (admin.totpEnrolled) throw new AppError('FORBIDDEN', 'TOTP is already enrolled and cannot be skipped.', 403);

  await deleteTempToken(adminTempTokenKey(tempToken));
  await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, adminId));

  const pair = await issueAdminSession(adminId);
  await writeAuditLog({ actorType: 'admin', actorId: adminId, action: 'admin.login', summary: 'Admin login completed (TOTP skipped — not yet enrolled)' });

  return {
    ...pair,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      customPermissions: (admin.customPermissions ?? []) as string[],
    },
  };
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

// Verifies a Google ID token issued to this app's client ID.
// Returns a tempToken if the email matches an active admin account.
export async function loginWithGoogle(idToken: string): Promise<{ tempToken: string; requiresTotpEnrollment: boolean }> {
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID);

  let email: string;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_OAUTH_CLIENT_ID });
    email = ticket.getPayload()?.email ?? '';
  } catch {
    throw new AppError('AUTH_REQUIRED', 'Invalid Google token.', 401);
  }

  if (!email) throw new AppError('AUTH_REQUIRED', 'Google token has no email.', 401);

  const admin = await db.query.admins.findFirst({ where: eq(admins.email, email) });
  // Deliberately vague — do not reveal if the email is registered.
  if (!admin || !admin.isActive) throw new AppError('AUTH_REQUIRED', 'No admin account for this Google account.', 401);

  const tempToken = uuidv4();
  await setTempToken(adminTempTokenKey(tempToken), admin.id, TEMP_TOKEN_TTL);

  return { tempToken, requiresTotpEnrollment: !admin.totpEnrolled };
}

// ── TOTP verification ─────────────────────────────────────────────────────────

// Final auth step — verify TOTP, issue access + refresh token pair.
export async function adminVerifyTotp(tempToken: string, code: string): Promise<TokenPair & { admin: { id: string; email: string; name: string; role: string; customPermissions: string[] } }> {
  const adminId = await getTempToken(adminTempTokenKey(tempToken));
  if (!adminId) throw new AppError('AUTH_REQUIRED', 'Temp token expired. Please log in again.', 401);

  const admin = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!admin || !admin.totpSecret) throw new AppError('AUTH_REQUIRED', 'TOTP not enrolled.', 401);

  const valid = authenticator.check(code, admin.totpSecret);
  if (!valid) throw new AppError('AUTH_REQUIRED', 'Invalid TOTP code.', 401);

  await deleteTempToken(adminTempTokenKey(tempToken));
  await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, adminId));

  const pair = await issueAdminSession(adminId);
  await writeAuditLog({ actorType: 'admin', actorId: adminId, action: 'admin.login', summary: 'Admin login completed (TOTP verified)' });

  return {
    ...pair,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      customPermissions: (admin.customPermissions ?? []) as string[],
    },
  };
}

// ── TOTP enrollment (first login) ─────────────────────────────────────────────

export async function beginTotpEnrollment(tempToken: string): Promise<{ qrCodeDataUrl: string; secret: string }> {
  const adminId = await getTempToken(adminTempTokenKey(tempToken));
  if (!adminId) throw new AppError('AUTH_REQUIRED', 'Temp token expired.', 401);

  const admin = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!admin) throw new AppError('NOT_FOUND', 'Admin not found.', 404);

  const secret = authenticator.generateSecret();
  await db.update(admins).set({ totpSecret: secret }).where(eq(admins.id, adminId));

  const otpauth = authenticator.keyuri(admin.email, env.APP_NAME, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return { qrCodeDataUrl, secret };
}

export async function confirmTotpEnrollment(tempToken: string, code: string): Promise<TokenPair & { admin: { id: string; email: string; name: string; role: string; customPermissions: string[] } }> {
  const adminId = await getTempToken(adminTempTokenKey(tempToken));
  if (!adminId) throw new AppError('AUTH_REQUIRED', 'Temp token expired.', 401);

  const admin = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!admin || !admin.totpSecret) throw new AppError('AUTH_REQUIRED', 'TOTP secret not set.', 401);

  const valid = authenticator.check(code, admin.totpSecret);
  if (!valid) throw new AppError('AUTH_REQUIRED', 'Invalid TOTP code.', 401);

  await db.update(admins).set({ totpEnrolled: true, lastLoginAt: new Date() }).where(eq(admins.id, adminId));
  await deleteTempToken(adminTempTokenKey(tempToken));

  const pair = await issueAdminSession(adminId);
  await writeAuditLog({ actorType: 'admin', actorId: adminId, action: 'admin.totpEnrolled', summary: 'Admin completed TOTP enrollment and logged in' });

  return {
    ...pair,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      customPermissions: (admin.customPermissions ?? []) as string[],
    },
  };
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

// Rotates the refresh token. If the incoming token was already used (replay detected),
// the entire session family is invalidated as a theft response.
export async function refreshAdminToken(refreshToken: string): Promise<TokenPair> {
  let payload: { sub: string; sessionId: string; jti: string };
  try {
    payload = await verifyRefreshToken(refreshToken, JWT_AUDIENCE.ADMIN);
  } catch {
    throw new AppError('AUTH_REQUIRED', 'Invalid or expired refresh token.', 401);
  }

  const session = await db.query.authSessions.findFirst({
    where: and(eq(authSessions.subjectId, payload.sub), eq(authSessions.audience, 'admin'), eq(authSessions.sessionId, payload.sessionId)),
  });

  if (!session) {
    // Refresh token is structurally valid but matches no live session — likely theft.
    // Revoke all admin sessions for this subject as a precaution.
    await db.update(authSessions)
      .set({ revokedAt: new Date(), revokedReason: 'theftDetected' })
      .where(and(eq(authSessions.subjectId, payload.sub), eq(authSessions.audience, 'admin')));
    await writeAuditLog({ actorType: 'admin', actorId: payload.sub, action: 'admin.sessionTheftDetected', summary: 'Refresh token replay detected — all sessions revoked' });
    throw new AppError('AUTH_REQUIRED', 'Session invalidated. Please log in again.', 401);
  }

  if (session.revokedAt) throw new AppError('AUTH_REQUIRED', 'Session has been revoked. Please log in again.', 401);

  return db.transaction(async (tx) => {
    // Revoke the current session before issuing a new one (rotation).
    await tx.update(authSessions).set({ revokedAt: new Date(), revokedReason: 'rotated' }).where(eq(authSessions.id, session.id));
    return issueAdminSession(payload.sub, tx);
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logoutAdmin(adminId: string, sessionId: string): Promise<void> {
  await db.update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: 'logout' })
    .where(and(eq(authSessions.subjectId, adminId), eq(authSessions.sessionId, sessionId)));
  await writeAuditLog({ actorType: 'admin', actorId: adminId, action: 'admin.logout', summary: 'Admin logged out' });
}

// ── Private helpers ───────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Issues a token pair and persists the session row. Used by both initial login and refresh.
async function issueAdminSession(adminId: string, tx?: Tx): Promise<TokenPair> {
  const pair = await issueTokenPair(adminId, JWT_AUDIENCE.ADMIN);
  const refreshHash = await bcrypt.hash(pair.refreshToken, 6);

  const values = {
    audience: 'admin',
    subjectId: adminId,
    sessionId: pair.sessionId,
    refreshTokenHash: refreshHash,
    // 7 days — matches REFRESH_EXPIRY for admin in jwt.ts
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  } as typeof authSessions.$inferInsert;

  if (tx) {
    await (tx as typeof db).insert(authSessions).values(values);
  } else {
    await db.insert(authSessions).values(values);
  }

  return pair;
}
