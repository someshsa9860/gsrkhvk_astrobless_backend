import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema/index.js';

dotenv.config();

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

// Default admin from env — idempotent, safe to re-run.
const SEED_ADMIN_EMAIL = process.env['SEED_ADMIN_EMAIL'] ?? 'tech@callvcal.com';

async function seedAdmin(): Promise<void> {
  const existing = await db.query.admins.findFirst({
    where: (a, { eq }) => eq(a.email, SEED_ADMIN_EMAIL!),
  });

  if (existing) {
    console.log(`Admin ${SEED_ADMIN_EMAIL} already exists (id: ${existing.id}) — skipping.`);
    return;
  }

  await db.insert(schema.admins).values({
    email: SEED_ADMIN_EMAIL!,
    name: process.env['SEED_ADMIN_NAME'] ?? 'Super Admin',
    role: 'superAdmin',
    totpEnrolled: false,
    isActive: true,
  });

  console.log(`Created super admin: ${SEED_ADMIN_EMAIL}`);
}

async function seedAppSettings(): Promise<void> {
  const defaults: Array<{ key: string; value: unknown; description: string; category: string }> = [
    {
      key: 'commission.defaultPct',
      value: 30,
      description: 'Default platform commission percentage applied to all astrologers',
      category: 'finance',
    },
    {
      key: 'wallet.minBalanceFiveMinPaise',
      value: 5000,
      description: 'Minimum wallet balance required to start a 5-minute consultation (in paise)',
      category: 'wallet',
    },
    {
      key: 'consultation.acceptTimeoutSeconds',
      value: 30,
      description: 'Seconds an astrologer has to accept/reject a consultation request before it expires',
      category: 'consultation',
    },
    {
      key: 'consultation.lowBalanceWarningSeconds',
      value: 60,
      description: 'Seconds before wallet runs out when the low-balance warning is sent',
      category: 'consultation',
    },
    {
      key: 'referral.signupBonusPaise',
      value: 5000,
      description: 'Wallet credit (in paise) given to a new customer who signs up via referral link',
      category: 'referral',
    },
    {
      key: 'aiChat.enabled',
      value: true,
      description: 'Whether the AI Astrologer chat feature is available to customers',
      category: 'feature',
    },
    {
      key: 'aiChat.pricePerMessagePaise',
      value: 200,
      description: 'Cost per AI chat message (in paise)',
      category: 'ai',
    },
    {
      key: 'featureFlags.videoCallsEnabled',
      value: false,
      description: 'Whether video call consultations are enabled (requires Agora setup)',
      category: 'feature',
    },
  ];

  for (const setting of defaults) {
    const existing = await db.query.appSettings.findFirst({
      where: (s, { eq }) => eq(s.key, setting.key),
    });

    if (existing) {
      console.log(`Setting ${setting.key} already exists — skipping.`);
      continue;
    }

    await db.insert(schema.appSettings).values({
      key: setting.key,
      value: setting.value,
      description: setting.description,
      category: setting.category,
    });

    console.log(`Seeded setting: ${setting.key} = ${JSON.stringify(setting.value)}`);
  }
}

async function main(): Promise<void> {
  console.log('Running seed...');
  await seedAdmin();
  await seedAppSettings();
  console.log('Seed complete.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
