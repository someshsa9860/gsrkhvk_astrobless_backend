import { AsyncLocalStorage } from 'async_hooks';
import type { Audience } from '../config/constants.js';

export type { Audience };

export interface RequestContext {
  traceId: string;
  spanId?: string;
  actorId?: string;
  actorType?: 'customer' | 'astrologer' | 'admin' | 'system';
  audience?: Audience;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  appVersion?: string;
  platform?: string;
  deviceId?: string;
  deviceModel?: string;
  deviceName?: string;
  osName?: string;
  osVersion?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext {
  return requestContextStorage.getStore() ?? { traceId: 'unknown' };
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn);
}
