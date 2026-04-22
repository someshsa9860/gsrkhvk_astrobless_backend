import pino from 'pino';
import { env } from '../config/env.js';

const redactPaths = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'password',
  'passwordHash',
  'otpCode',
  'otp',
  'cvv',
  'cardNumber',
  'kycDocsRef',
  'bankAccountRef',
  'totpSecret',
  'token',
  'refreshToken',
  'accessToken',
  'privateKey',
  'secret',
  'APPLE_PRIVATE_KEY',
];

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
    bindings(bindings) {
      return {
        pid: bindings['pid'],
        host: bindings['hostname'],
        service: 'astroconnect-backend',
        version: env.APP_VERSION,
        region: env.REGION,
      };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings) as Logger;
}
