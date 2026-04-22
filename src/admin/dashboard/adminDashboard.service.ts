// Dashboard service: live KPI snapshot. Each metric is wrapped in try/catch so
// a single DB failure never breaks the entire dashboard response.

import { eq, gte, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema/customers.js';
import { astrologers } from '../../db/schema/astrologers.js';
import { consultations } from '../../db/schema/consultations.js';
import { systemErrors } from '../../db/schema/observability.js';
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
    safeCount(
      db
        .select({ count: sql<number>`count(*)` })
        .from(consultations)
        .where(eq(consultations.status, 'active'))
        .then((r) => Number(r[0]?.count ?? 0)),
      0,
      'activeConsultations',
    ),
    safeCount(
      db
        .select({ count: sql<number>`count(*)` })
        .from(astrologers)
        .where(eq(astrologers.isOnline, true))
        .then((r) => Number(r[0]?.count ?? 0)),
      0,
      'astrologersOnline',
    ),
    safeCount(
      db
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .where(gte(customers.createdAt, today))
        .then((r) => Number(r[0]?.count ?? 0)),
      0,
      'newSignupsToday',
    ),
    safeCount(
      db
        .select({ count: sql<number>`count(*)` })
        .from(astrologers)
        .where(eq(astrologers.kycStatus, 'pending'))
        .then((r) => Number(r[0]?.count ?? 0)),
      0,
      'pendingKyc',
    ),
    safeCount(
      db
        .select({ count: sql<number>`count(*)` })
        .from(systemErrors)
        .where(gte(systemErrors.createdAt, last24h))
        .then((r) => Number(r[0]?.count ?? 0)),
      0,
      'recentErrors',
    ),
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
  // Aggregate customers by country
  const customerRows = await db
    .select({
      country: customers.registrationCountry,
      countryCode: customers.registrationCountryCode,
      city: customers.registrationCity,
      count: sql<number>`count(*)`,
    })
    .from(customers)
    .where(sql`${customers.registrationCountryCode} is not null`)
    .groupBy(customers.registrationCountry, customers.registrationCountryCode, customers.registrationCity)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  // Aggregate astrologers by country
  const astrologerRows = await db
    .select({
      country: astrologers.registrationCountry,
      countryCode: astrologers.registrationCountryCode,
      city: astrologers.registrationCity,
      count: sql<number>`count(*)`,
    })
    .from(astrologers)
    .where(sql`${astrologers.registrationCountryCode} is not null`)
    .groupBy(astrologers.registrationCountry, astrologers.registrationCountryCode, astrologers.registrationCity)
    .orderBy(desc(sql`count(*)`))
    .limit(50);

  // Merge by country+city key
  const map = new Map<string, GeoPoint>();

  for (const r of customerRows) {
    const key = `${r.countryCode ?? ''}:${r.city ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.customers += Number(r.count);
      existing.total += Number(r.count);
    } else {
      map.set(key, {
        country: r.country ?? 'Unknown',
        countryCode: r.countryCode ?? '',
        city: r.city,
        customers: Number(r.count),
        astrologers: 0,
        total: Number(r.count),
      });
    }
  }

  for (const r of astrologerRows) {
    const key = `${r.countryCode ?? ''}:${r.city ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.astrologers += Number(r.count);
      existing.total += Number(r.count);
    } else {
      map.set(key, {
        country: r.country ?? 'Unknown',
        countryCode: r.countryCode ?? '',
        city: r.city,
        customers: 0,
        astrologers: Number(r.count),
        total: Number(r.count),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 30);
}
