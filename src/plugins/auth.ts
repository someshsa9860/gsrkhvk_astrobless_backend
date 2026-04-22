import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyPluginAsync, preHandlerHookHandler } from 'fastify';
import { jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { JWT_AUDIENCE } from '../config/constants.js';
import type { Audience } from '../config/constants.js';
import { AppError } from '../lib/errors.js';
import { requirePermission as rbacRequirePermission, requireRole as rbacRequireRole } from '../admin/shared/rbac.js';
import type { AdminPermission, AdminRole } from '../admin/shared/rbac.js';

function secretBytes(audience: Audience): Uint8Array {
  const raw = audience === JWT_AUDIENCE.CUSTOMER ? env.JWT_SECRET_CUSTOMER
    : audience === JWT_AUDIENCE.ASTROLOGER ? env.JWT_SECRET_ASTROLOGER
    : env.JWT_SECRET_ADMIN;
  return new TextEncoder().encode(raw);
}

function audienceToActorType(audience: Audience): 'customer' | 'astrologer' | 'admin' {
  if (audience === JWT_AUDIENCE.CUSTOMER) return 'customer';
  if (audience === JWT_AUDIENCE.ASTROLOGER) return 'astrologer';
  return 'admin';
}

const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET_CUSTOMER,
    sign: { expiresIn: '15m' },
  });

  app.decorate('requireAudience', (expectedAudience: Audience): preHandlerHookHandler => {
    return async (req) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new AppError('AUTH_REQUIRED', 'Authorization header missing', 401);
      }

      const token = authHeader.slice(7);
      let payload: Record<string, unknown>;

      try {
        const { payload: p } = await jwtVerify(token, secretBytes(expectedAudience), { audience: expectedAudience });
        payload = p as Record<string, unknown>;
      } catch {
        throw new AppError('AUTH_REQUIRED', 'Invalid or expired token', 401);
      }

      if (payload['aud'] !== expectedAudience) {
        throw new AppError('AUDIENCE_MISMATCH', 'Token audience does not match this route', 403);
      }

      req.requestContext = {
        ...req.requestContext,
        actorId: payload['sub'] as string,
        actorType: audienceToActorType(expectedAudience),
        audience: expectedAudience,
      };

      (req as unknown as Record<string, unknown>)['user'] = payload;
    };
  });

  app.decorate('requireAuth', (): preHandlerHookHandler => {
    return app.requireAudience(JWT_AUDIENCE.CUSTOMER);
  });

  // requirePermission and requireRole are thin wrappers around the RBAC module.
  // They must be used ALONGSIDE requireAudience — never as a replacement for it.
  app.decorate('requirePermission', (...perms: AdminPermission[]): preHandlerHookHandler => {
    return rbacRequirePermission(...perms);
  });

  app.decorate('requireRole', (...roles: AdminRole[]): preHandlerHookHandler => {
    return rbacRequireRole(...roles);
  });
};

export default fp(authPlugin, { name: 'auth' });
