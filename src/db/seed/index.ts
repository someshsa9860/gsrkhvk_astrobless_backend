import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../client.js';
import { AdminPermission } from '../../admin/shared/rbac.js';
import { seedLanguagesAndSkills } from './languagesSkillsSeed.js';

if (!process.env['DATABASE_URL']) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const SEED_ADMIN_EMAIL = process.env['SEED_ADMIN_EMAIL'] ?? 'tech@callvcal.com';
const ALL_PERMISSIONS = Object.values(AdminPermission);

async function seedAdmin(): Promise<void> {
  await prisma.admin.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {
      role: 'superAdmin',
      isActive: true,
      customPermissions: ALL_PERMISSIONS,
    },
    create: {
      email: SEED_ADMIN_EMAIL,
      name: process.env['SEED_ADMIN_NAME'] ?? 'Super Admin',
      role: 'superAdmin',
      isActive: true,
      customPermissions: ALL_PERMISSIONS,
    },
  });

  console.log(`Upserted super admin: ${SEED_ADMIN_EMAIL} (all ${ALL_PERMISSIONS.length} permissions granted)`);
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
      key: 'wallet.minBalanceFiveMin',
      value: 50,
      description: 'Minimum wallet balance required to start a 5-minute consultation (in ₹)',
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
      key: 'referral.signupBonus',
      value: 50,
      description: 'Wallet credit given to a new customer who signs up via referral link (in ₹)',
      category: 'referral',
    },
    {
      key: 'aiChat.enabled',
      value: true,
      description: 'Whether the AI Astrologer chat feature is available to customers',
      category: 'feature',
    },
    {
      key: 'aiChat.pricePerMessage',
      value: 2,
      description: 'Cost per AI chat message (in ₹)',
      category: 'ai',
    },
    {
      key: 'featureFlags.videoCallsEnabled',
      value: false,
      description: 'Whether video call consultations are enabled (requires Agora setup)',
      category: 'feature',
    },
    {
      key: 'featureFlags.astromallEnabled',
      value: false,
      description: 'Whether the AstroMall (products & orders) is visible in the app and admin panel. Off by default.',
      category: 'feature',
    },
    {
      key: 'kundli.showPreBirthDasha',
      value: false,
      description: "When true, Vimshottari dasha periods that ended before the native's birth date are included in the kundli report. When false (default), only post-birth periods are shown.",
      category: 'kundli',
    },
  ];

  // Rename legacy keys
  const renames: Record<string, string> = {
    'aiChat.pricePerMessagePaise': 'aiChat.pricePerMessage',
  };
  for (const [oldKey, newKey] of Object.entries(renames)) {
    const old = await prisma.appSetting.findFirst({ where: { key: oldKey } });
    if (old) {
      const newExists = await prisma.appSetting.findFirst({ where: { key: newKey } });
      if (!newExists) {
        await prisma.appSetting.update({ where: { id: old.id }, data: { key: newKey } });
        console.log(`Renamed setting: ${oldKey} → ${newKey}`);
      } else {
        await prisma.appSetting.delete({ where: { id: old.id } });
        console.log(`Deleted legacy setting: ${oldKey} (${newKey} already exists)`);
      }
    }
  }

  for (const setting of defaults) {
    const existing = await prisma.appSetting.findFirst({ where: { key: setting.key } });

    if (existing) {
      console.log(`Setting ${setting.key} already exists — skipping.`);
      continue;
    }

    await prisma.appSetting.create({
      data: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
        category: setting.category,
      },
    });

    console.log(`Seeded setting: ${setting.key} = ${JSON.stringify(setting.value)}`);
  }
}

async function main(): Promise<void> {
  console.log('Running seed...');
  await seedAdmin();
  await seedAppSettings();
  await seedLanguagesAndSkills();
  console.log('Seed complete.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
