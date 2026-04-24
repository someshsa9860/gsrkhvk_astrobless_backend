import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from './errors.js';

// ── Google ────────────────────────────────────────────────────────────────────

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * Verifies a Google ID token against Google's public JWKS.
 * Returns { sub, email, name, picture } on success.
 * Throws AppError('AUTH_REQUIRED', ..., 401) on failure.
 */
export async function verifyGoogleToken(
  idToken: string,
  clientId: string,
): Promise<{ sub: string; email: string; name?: string; picture?: string }> {
  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      audience: clientId,
      issuer: GOOGLE_ISSUERS,
    });

    const sub = payload.sub;
    const email = payload['email'] as string | undefined;

    if (!sub || !email) {
      throw new AppError('AUTH_REQUIRED', 'Google token is missing required claims.', 401);
    }

    return {
      sub,
      email,
      name: payload['name'] as string | undefined,
      picture: payload['picture'] as string | undefined,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('AUTH_REQUIRED', 'Invalid Google token.', 401);
  }
}

// ── Apple ─────────────────────────────────────────────────────────────────────

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * Verifies an Apple identity token against Apple's public JWKS.
 * Returns { sub, email } on success. Email may be absent on repeat sign-ins.
 * Throws AppError('AUTH_REQUIRED', ..., 401) on failure.
 */
export async function verifyAppleToken(
  identityToken: string,
  audience: string,
): Promise<{ sub: string; email?: string }> {
  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      audience,
      issuer: APPLE_ISSUER,
    });

    const sub = payload.sub;
    if (!sub) {
      throw new AppError('AUTH_REQUIRED', 'Apple token is missing sub claim.', 401);
    }

    return {
      sub,
      email: payload['email'] as string | undefined,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('AUTH_REQUIRED', 'Invalid Apple token.', 401);
  }
}
