// Dashboard service: live KPI snapshot. Each metric is wrapped in try/catch so
// a single DB failure never breaks the entire dashboard response.

import { prisma } from '../../db/client.js';
import { logger } from '../../lib/logger.js';

// ── Overview ──────────────────────────────────────────────────────────────────

export async function getOverview() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  async function safeCount<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    try {
      return await promise;
    } catch (err) {
      logger.error({ err, label }, 'Dashboard metric failed — using fallback');
      return fallback;
    }
  }

  const [
    activeConsultations,
    astrologersOnline,
    newSignupsToday,
    pendingKyc,
    recentErrors,
  ] = await Promise.all([
    safeCount(prisma.consultation.count({ where: { status: 'active' } }), 0, 'activeConsultations'),
    safeCount(prisma.astrologer.count({ where: { isOnline: true } }), 0, 'astrologersOnline'),
    safeCount(prisma.customer.count({ where: { createdAt: { gte: today } } }), 0, 'newSignupsToday'),
    safeCount(prisma.astrologer.count({ where: { kycStatus: 'pending' } }), 0, 'pendingKyc'),
    safeCount(prisma.systemError.count({ where: { createdAt: { gte: last24h } } }), 0, 'recentErrors'),
  ]);

  return {
    activeConsultationsNow: activeConsultations,
    astrologersOnlineNow: astrologersOnline,
    newSignupsToday,
    pendingKycCount: pendingKyc,
    errorsLast24h: recentErrors,
  };
}

// ── Geo distribution ──────────────────────────────────────────────────────────

export interface GeoPoint {
  country: string;
  countryCode: string;
  city: string | null;
  customers: number;
  astrologers: number;
  total: number;
}

export async function getGeoDistribution(): Promise<GeoPoint[]> {
  const [customerRows, astrologerRows] = await Promise.all([
    prisma.customer.groupBy({
      by: ['registrationCountry', 'registrationCountryCode', 'registrationCity'],
      where: { registrationCountryCode: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    }),
    prisma.astrologer.groupBy({
      by: ['registrationCountry', 'registrationCountryCode', 'registrationCity'],
      where: { registrationCountryCode: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    }),
  ]);

  const map = new Map<string, GeoPoint>();

  for (const r of customerRows) {
    const key = `${r.registrationCountryCode ?? ''}:${r.registrationCity ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.customers += r._count.id;
      existing.total += r._count.id;
    } else {
      map.set(key, {
        country: r.registrationCountry ?? 'Unknown',
        countryCode: r.registrationCountryCode ?? '',
        city: r.registrationCity,
        customers: r._count.id,
        astrologers: 0,
        total: r._count.id,
      });
    }
  }

  for (const r of astrologerRows) {
    const key = `${r.registrationCountryCode ?? ''}:${r.registrationCity ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.astrologers += r._count.id;
      existing.total += r._count.id;
    } else {
      map.set(key, {
        country: r.registrationCountry ?? 'Unknown',
        countryCode: r.registrationCountryCode ?? '',
        city: r.registrationCity,
        customers: 0,
        astrologers: r._count.id,
        total: r._count.id,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 30);
}
