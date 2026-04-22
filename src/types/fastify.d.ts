import type { preHandlerHookHandler } from 'fastify';
import '@fastify/jwt';
import type { RequestContext } from '../lib/context.js';
import type { Audience } from '../config/constants.js';
import type { AdminPermission, AdminRole } from '../admin/shared/rbac.js';

declare module 'fastify' {
  interface FastifyRequest {
    requestContext: RequestContext;
  }

  interface FastifyInstance {
    requireAudience(audience: Audience): preHandlerHookHandler;
    requireAuth(): preHandlerHookHandler;
    requirePermission(...perms: AdminPermission[]): preHandlerHookHandler;
    requireRole(...roles: AdminRole[]): preHandlerHookHandler;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export interface JwtPayload {
  sub: string;
  aud: Audience;
  iat: number;
  exp: number;
  jti: string;
  sessionId: string;
}
