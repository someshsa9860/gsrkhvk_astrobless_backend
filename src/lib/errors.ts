export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUDIENCE_MISMATCH'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'RATE_LIMIT'
  | 'CONFLICT'
  | 'EMAIL_NOT_VERIFIED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'PASSWORD_WEAK'
  | 'WALLET_INSUFFICIENT'
  | 'ASTROLOGER_BUSY'
  | 'CONSULTATION_NOT_ACTIVE'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'AGORA_TOKEN_ERROR'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
