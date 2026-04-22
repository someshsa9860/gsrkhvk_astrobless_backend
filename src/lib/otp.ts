import crypto from 'crypto';
import { setOtp, getOtp, deleteOtp, otpKey } from './redis.js';
import { AppError } from './errors.js';
import { env } from '../config/env.js';

const TEST_OTP_CODE = '123456';

export function generateOtp(): string {
  // In test mode, always emit the known test code so logs show the expected value.
  if (env.TEST_OTP) return TEST_OTP_CODE;
  return String(crypto.randomInt(100000, 999999));
}

// High-level: build the standard key and store.
export async function storeOtp(
  persona: string,
  type: 'phone' | 'email',
  identifier: string,
  ttlSeconds: number,
): Promise<string> {
  const otp = generateOtp();
  await setOtp(otpKey(persona, type, identifier), otp, ttlSeconds);
  return otp;
}

// Low-level: store against a pre-built key (used by adminAuth which builds its own key).
export async function storeOtpByKey(key: string, ttlSeconds: number): Promise<string> {
  const otp = generateOtp();
  await setOtp(key, otp, ttlSeconds);
  return otp;
}

// High-level verify.
export async function verifyAndConsumeOtp(
  persona: string,
  type: 'phone' | 'email',
  identifier: string,
  submittedOtp: string,
): Promise<void> {
  await verifyAndConsumeOtpByKey(otpKey(persona, type, identifier), submittedOtp);
}

// Low-level verify — used by adminAuth and any other code that builds its own key.
export async function verifyAndConsumeOtpByKey(key: string, submittedOtp: string): Promise<void> {
  // TEST_OTP mode: accept the magic code without hitting Redis.
  if (env.TEST_OTP && submittedOtp === TEST_OTP_CODE) return;

  const stored = await getOtp(key);
  if (!stored) throw new AppError('OTP_EXPIRED', 'OTP has expired. Please request a new one.', 400);
  if (stored !== submittedOtp) throw new AppError('OTP_INVALID', 'Invalid OTP.', 400);

  await deleteOtp(key);
}
