import { env } from './env.js';

// Derive app identity from APP_NAME env or default to a generic identifier.
// Never hardcode a product name in logic — change APP_NAME in .env instead.
const appId = env.APP_NAME;

export const JWT_AUDIENCE = {
  CUSTOMER: `${appId}.customer`,
  ASTROLOGER: `${appId}.astrologer`,
  ADMIN: `${appId}.admin`,
} as const;

export type Audience = (typeof JWT_AUDIENCE)[keyof typeof JWT_AUDIENCE];

export const SERVICE_NAME = `${appId}-backend`;

export const METRICS_PREFIX = `${appId}_`;

export const DEFAULT_CURRENCY = env.DEFAULT_CURRENCY;
