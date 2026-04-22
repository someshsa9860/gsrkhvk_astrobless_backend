import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// MSG91 Email API — uses their transactional email service.
// Alternatively, swap in AWS SES by setting the SES env vars.
const MSG91_EMAIL_API = 'https://api.msg91.com/api/v5/email/send';

export async function sendEmailOtp(email: string, otp: string, recipientName?: string): Promise<void> {
  if (!env.MSG91_AUTH_KEY) {
    logger.warn({ email }, 'MSG91_AUTH_KEY not set — skipping email OTP send');
    // In dev without MSG91, log the OTP so devs can see it.
    logger.info({ email, otp }, '[DEV] Email OTP (not sent — no MSG91 key)');
    return;
  }

  if (env.TEST_OTP) {
    logger.info({ email, otp }, '[TEST_OTP] Email OTP skipped — use 123456');
    return;
  }

  try {
    await axios.post(
      MSG91_EMAIL_API,
      {
        recipients: [{ to: [{ email, name: recipientName ?? email }] }],
        from: { email: env.SES_FROM_EMAIL, name: 'Astrobless' },
        domain: env.MSG91_EMAIL_DOMAIN,
        template_id: env.MSG91_EMAIL_OTP_TEMPLATE_ID,
        variables: { otp, appName: 'Astrobless' },
      },
      { headers: { authkey: env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' } },
    );
    logger.info({ email }, 'Email OTP sent via MSG91');
  } catch (err) {
    logger.error({ err, email }, 'MSG91 email send failed');
    throw err;
  }
}

export async function sendTransactionalEmail(opts: {
  to: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}): Promise<void> {
  if (!env.MSG91_AUTH_KEY) {
    logger.warn({ to: opts.to, subject: opts.subject }, 'MSG91_AUTH_KEY not set — email skipped');
    return;
  }
  if (env.TEST_OTP) {
    logger.info({ to: opts.to, subject: opts.subject }, '[TEST_OTP] Transactional email skipped');
    return;
  }

  try {
    await axios.post(
      MSG91_EMAIL_API,
      {
        recipients: [{ to: [{ email: opts.to, name: opts.toName ?? opts.to }] }],
        from: { email: env.SES_FROM_EMAIL, name: 'Astrobless' },
        domain: env.MSG91_EMAIL_DOMAIN,
        subject: opts.subject,
        body: opts.htmlBody,
        text: opts.textBody,
      },
      { headers: { authkey: env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    logger.error({ err, to: opts.to }, 'MSG91 transactional email send failed');
    throw err;
  }
}
