import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { JWT_AUDIENCE } from '../config/constants.js';
import type { Audience } from '../config/constants.js';

export type { Audience };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

function secret(audience: Audience, type: 'access' | 'refresh'): Uint8Array {
  let raw: string;
  if (type === 'access') {
    raw = audience === JWT_AUDIENCE.CUSTOMER ? env.JWT_SECRET_CUSTOMER
      : audience === JWT_AUDIENCE.ASTROLOGER ? env.JWT_SECRET_ASTROLOGER
      : env.JWT_SECRET_ADMIN;
  } else {
    raw = audience === JWT_AUDIENCE.CUSTOMER ? env.JWT_REFRESH_SECRET_CUSTOMER
      : audience === JWT_AUDIENCE.ASTROLOGER ? env.JWT_REFRESH_SECRET_ASTROLOGER
      : env.JWT_REFRESH_SECRET_ADMIN;
  }
  return new TextEncoder().encode(raw);
}

// Access token expiry per audience. Admin is 1h (short) because silent refresh via
// the Next.js proxy renews it before expiry — no manual re-login within the 7d refresh window.
const ACCESS_EXPIRY: Record<Audience, string> = {
  [JWT_AUDIENCE.CUSTOMER]: '15m',
  [JWT_AUDIENCE.ASTROLOGER]: '15m',
  [JWT_AUDIENCE.ADMIN]: '1h',
};

// Refresh token expiry. Admin is 7d (shorter than customer/astrologer 30d) because
// admin sessions are higher-risk and should require full re-auth weekly.
const REFRESH_EXPIRY: Record<Audience, string> = {
  [JWT_AUDIENCE.CUSTOMER]: '30d',
  [JWT_AUDIENCE.ASTROLOGER]: '30d',
  [JWT_AUDIENCE.ADMIN]: '7d',
};

export async function issueTokenPair(subjectId: string, audience: Audience): Promise<TokenPair> {
  const sessionId = uuidv4();
  const jti = uuidv4();

  const accessToken = await new SignJWT({ sub: subjectId, aud: audience, sessionId, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY[audience])
    .sign(secret(audience, 'access'));

  const refreshToken = await new SignJWT({ sub: subjectId, aud: audience, sessionId, jti: uuidv4() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY[audience])
    .sign(secret(audience, 'refresh'));

  return { accessToken, refreshToken, sessionId };
}

export async function verifyAccessToken(token: string, audience: Audience): Promise<{ sub: string; sessionId: string; jti: string }> {
  const { payload } = await jwtVerify(token, secret(audience, 'access'), { audience });
  return {
    sub: payload.sub as string,
    sessionId: payload['sessionId'] as string,
    jti: payload.jti as string,
  };
}

export async function verifyRefreshToken(token: string, audience: Audience): Promise<{ sub: string; sessionId: string; jti: string }> {
  const { payload } = await jwtVerify(token, secret(audience, 'refresh'), { audience });
  return {
    sub: payload.sub as string,
    sessionId: payload['sessionId'] as string,
    jti: payload.jti as string,
  };
}
