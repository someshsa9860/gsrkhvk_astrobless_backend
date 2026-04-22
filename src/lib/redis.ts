import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

export const pubRedis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export const subRedis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

// ─── OTP helpers ────────────────────────────────────────────────────────────

export function otpKey(persona: string, type: 'phone' | 'email', identifier: string): string {
  return `otp:${persona}:${type}:${identifier}`;
}

export async function setOtp(key: string, otp: string, ttlSeconds: number): Promise<void> {
  await redis.set(key, otp, 'EX', ttlSeconds);
}

export async function getOtp(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function deleteOtp(key: string): Promise<void> {
  await redis.del(key);
}

// ─── Session helpers ─────────────────────────────────────────────────────────

export function adminTempTokenKey(token: string): string {
  return `admin:tempToken:${token}`;
}

export async function setTempToken(key: string, value: string, ttlSeconds: number): Promise<void> {
  await redis.set(key, value, 'EX', ttlSeconds);
}

export async function getTempToken(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function deleteTempToken(key: string): Promise<void> {
  await redis.del(key);
}
