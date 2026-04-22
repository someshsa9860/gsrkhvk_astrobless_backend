import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const MSG91_API = 'https://api.msg91.com/api/v5';

// Send OTP via MSG91 OTP API.
// Template ID must be pre-created in MSG91 dashboard with {{otp}} variable.
export async function sendSmsOtp(phone: string, otp: string): Promise<void> {
  if (!env.MSG91_AUTH_KEY) {
    logger.warn({ phone }, 'MSG91_AUTH_KEY not set — skipping SMS send');
    return;
  }

  // In test mode, skip actual delivery — the known test code works without it.
  if (env.TEST_OTP) {
    logger.info({ phone, otp }, '[TEST_OTP] SMS OTP skipped');
    return;
  }

  const mobile = phone.startsWith('+') ? phone.slice(1) : `91${phone.replace(/^0/, '')}`;

  try {
    await axios.post(
      `${MSG91_API}/otp`,
      { mobile, otp, sender: env.MSG91_SENDER_ID, template_id: env.MSG91_OTP_TEMPLATE_ID },
      { headers: { authkey: env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' } },
    );
    logger.info({ phone }, 'SMS OTP sent via MSG91');
  } catch (err) {
    // Log but don't throw — SMS failure should not block the API response.
    // The caller (auth service) decides whether to surface this to the user.
    logger.error({ err, phone }, 'MSG91 SMS send failed');
    throw err;
  }
}

// Verify OTP via MSG91 (uses MSG91's own Redis storage — alternative to our own).
// Only call this if you opted into MSG91's own OTP storage (not our Redis).
export async function verifyMsg91Otp(phone: string, otp: string): Promise<boolean> {
  if (!env.MSG91_AUTH_KEY) return false;
  const mobile = phone.startsWith('+') ? phone.slice(1) : `91${phone.replace(/^0/, '')}`;
  try {
    const res = await axios.get<{ type: string; message: string }>(
      `${MSG91_API}/otp/verify`,
      { params: { mobile, otp }, headers: { authkey: env.MSG91_AUTH_KEY } },
    );
    return res.data.type === 'success';
  } catch {
    return false;
  }
}
