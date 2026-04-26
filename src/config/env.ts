import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_NAME: z.string().default('app'),
  APP_VERSION: z.string().default('1.0.0'),
  REGION: z.string().default('ap-south-1'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  ADMIN_BASE_URL: z.string().default('http://localhost:3001'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Audience-scoped JWT secrets (CLAUDE.md §6.4)
  JWT_SECRET_CUSTOMER: z.string().min(32),
  JWT_REFRESH_SECRET_CUSTOMER: z.string().min(32),
  JWT_SECRET_ASTROLOGER: z.string().min(32),
  JWT_REFRESH_SECRET_ASTROLOGER: z.string().min(32),
  JWT_SECRET_ADMIN: z.string().min(32),
  JWT_REFRESH_SECRET_ADMIN: z.string().min(32),

  // Google OAuth (customer only)
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(''),

  // Apple Sign-In (customer iOS only)
  APPLE_SERVICE_ID: z.string().default(''),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  APPLE_PRIVATE_KEY: z.string().default(''),

  // SMS OTP (MSG91)
  MSG91_AUTH_KEY: z.string().default(''),
  MSG91_SENDER_ID: z.string().default('ASTBLS'),
  MSG91_OTP_TEMPLATE_ID: z.string().default(''), // pre-created OTP template in MSG91 dashboard

  // Email (MSG91 Email / fallback SES)
  SES_REGION: z.string().default('ap-south-1'),
  SES_FROM_EMAIL: z.string().default('noreply@astrobless.app'),
  MSG91_EMAIL_DOMAIN: z.string().default(''),           // verified domain in MSG91
  MSG91_EMAIL_OTP_TEMPLATE_ID: z.string().default(''),  // email OTP template ID in MSG91

  // Payment providers
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

  PHONEPE_MERCHANT_ID: z.string().default(''),
  PHONEPE_SALT_KEY: z.string().default(''),
  PHONEPE_SALT_INDEX: z.coerce.number().default(1),
  PHONEPE_BASE_URL: z.string().default('https://api-preprod.phonepe.com/apis/pg-sandbox'),

  GOOGLE_PAY_MERCHANT_ID: z.string().default(''),
  APPLE_PAY_MERCHANT_ID: z.string().default(''),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  // Agora (calls)
  AGORA_APP_ID: z.string().default(''),
  AGORA_APP_CERTIFICATE: z.string().default(''),

  // Firebase FCM
  FCM_SERVICE_ACCOUNT_JSON: z.string().default(''),

  // Storage provider (local | s3 | r2)
  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).default('local'),
  // Base URL at which public/ files are served (no trailing slash)
  // local: http://localhost:3000  |  s3: https://<bucket>.s3.<region>.amazonaws.com  |  r2: https://<account>.r2.cloudflarestorage.com/<bucket>
  STORAGE_PUBLIC_URL: z.string().default('http://localhost:3000'),
  // Local disk path for the local provider (relative to project root or absolute)
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),

  // AWS S3 (also used when STORAGE_PROVIDER=s3)
  S3_BUCKET: z.string().default('astrobless-dev'),
  S3_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),

  // CloudFront CDN (optional — when set, all public URLs and signed downloads go through CF)
  // CLOUDFRONT_DOMAIN: your CF distribution domain, e.g. d1234abcd.cloudfront.net
  // CLOUDFRONT_KEY_PAIR_ID: the CF public key ID from the AWS console
  // CLOUDFRONT_PRIVATE_KEY: path to the .pem file (e.g. /run/secrets/cloudfront.pem)
  //                         OR the raw PEM string (multiline, with header/footer)
  // CLOUDFRONT_URL_TTL_SECONDS: how long signed URLs are valid (default 3600 = 1h)
  CLOUDFRONT_DOMAIN: z.string().default(''),
  CLOUDFRONT_KEY_PAIR_ID: z.string().default(''),
  CLOUDFRONT_PRIVATE_KEY: z.string().default(''),
  CLOUDFRONT_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Cloudflare R2 (when STORAGE_PROVIDER=r2)
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default('astrobless'),
  R2_PUBLIC_URL: z.string().default(''),

  // Anthropic Claude
  ANTHROPIC_API_KEY: z.string().default(''),

  // VedicAstroAPI (vedicastroapi.com v3-json) — 500 calls/day on free tier
  // Sign up at https://vedicastroapi.com → Dashboard → API Credentials
  // Auth: ?api_key=YOUR_API_KEY query param — no userId needed
  VEDIC_ASTRO_API_KEY: z.string().default(''),

  // Observability
  SENTRY_DSN: z.string().default(''),
  LOKI_URL: z.string().default('http://localhost:3100'),
  TEMPO_URL: z.string().default('http://localhost:4317'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),

  // Currency
  DEFAULT_CURRENCY: z.string().default('INR'),

  // Test mode — if true, any OTP "123456" is accepted (local/dev only; never enable in prod)
  TEST_OTP: z.coerce.boolean().default(false),

  // Feature flags
  ENABLE_AI_CHAT: z.coerce.boolean().default(true),
  ENABLE_VIDEO_CALLS: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${errors}`);
  }
  return result.data;
}

export const env = parseEnv();
