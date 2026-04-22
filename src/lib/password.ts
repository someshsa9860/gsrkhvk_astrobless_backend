import bcrypt from 'bcrypt';
import { AppError } from './errors.js';

const BCRYPT_COST = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function assertPasswordStrength(password: string): void {
  if (!PASSWORD_REGEX.test(password)) {
    throw new AppError('PASSWORD_WEAK', 'Password must be at least 8 characters with uppercase, lowercase, and a digit.', 400);
  }
}
