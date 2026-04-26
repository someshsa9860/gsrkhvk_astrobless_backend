import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import {
  getBirthChartData,
  getAshtakvarga,
  getDivisionalChart,
  getFullDashaData,
  getSpecificSubDasha,
  getKundliMatch,
  type BirthChartInput,
  type DashaPeriod,
  type AshtakvargaPlanet,
  type DivisionalDiv,
} from '../../lib/vedicAstroClient.js';
import { getStorage, keyToUrl } from '../../lib/storage/index.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { getSettingValue } from '../../admin/settings/adminSettings.service.js';
import { logger } from '../../lib/logger.js';
import type { z } from 'zod';
import type { CreateKundliProfileSchema } from './kundli.schema.js';

// ── Storage key helpers ───────────────────────────────────────────────────────
// Standard URL structure: public/kundli/{customerId}/{profileId}/{tab}/{name}.svg
// This makes keys human-readable and groupable by prefix in S3 / local storage.

function chartSvgKey(customerId: string, profileId: string, div: string): string {
  return `public/kundli/${customerId}/${profileId}/charts/${div}.svg`;
}

function ashtakvargaSvgKey(customerId: string, profileId: string, planet: string): string {
  return `public/kundli/${customerId}/${profileId}/ashtakvarga/${planet}.svg`;
}

async function uploadSvg(key: string, svgString: string): Promise<string | null> {
  try {
    await getStorage().upload(key, Buffer.from(svgString, 'utf-8'), 'image/svg+xml');
    return key;
  } catch (err) {
    logger.warn({ err, key }, '[kundli] SVG upload failed');
    return null;
  }
}

async function deleteProfileSvgs(customerId: string, profileId: string): Promise<void> {
  // Delete all SVGs under this profile's storage prefix (fire-and-forget)
  const prefix = `public/kundli/${customerId}/${profileId}/`;
  try {
    const keys = await getStorage().listKeys(prefix);
    await Promise.all(keys.map((k) => getStorage().delete(k)));
    logger.debug({ prefix, count: keys.length }, '[kundli] deleted profile SVGs');
  } catch (err) {
    logger.warn({ err, prefix }, '[kundli] failed to delete profile SVGs');
  }
}

// ── Profile CRUD ──────────────────────────────────────────────────────────────

export async function listProfiles(customerId: string) {
  return prisma.kundliProfile.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getProfile(customerId: string, profileId: string) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);
  return profile;
}

export async function createProfile(
  customerId: string,
  input: z.infer<typeof CreateKundliProfileSchema>,
) {
  const profile = await prisma.kundliProfile.create({
    data: {
      customerId,
      label: input.label,
      birthDate: input.birthDate,
      birthTime: input.birthTime ?? null,
      birthPlace: input.birthPlace,
      birthLat: String(input.birthLat),
      birthLng: String(input.birthLng),
      timezoneOffset: String(input.timezoneOffset),
    },
  });

  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'kundli.profileCreated',
    targetType: 'kundliProfile',
    targetId: profile.id,
    summary: `Created kundli profile "${input.label}" for ${input.birthPlace}`,
    afterState: { label: input.label, birthDate: input.birthDate, birthPlace: input.birthPlace },
  });

  return profile;
}

export async function updateProfile(
  customerId: string,
  profileId: string,
  input: Partial<z.infer<typeof CreateKundliProfileSchema>>,
) {
  const existing = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);

  const updated = await prisma.kundliProfile.update({
    where: { id: profileId },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
      ...(input.birthTime !== undefined && { birthTime: input.birthTime ?? null }),
      ...(input.birthPlace !== undefined && { birthPlace: input.birthPlace }),
      ...(input.birthLat !== undefined && { birthLat: String(input.birthLat) }),
      ...(input.birthLng !== undefined && { birthLng: String(input.birthLng) }),
      ...(input.timezoneOffset !== undefined && { timezoneOffset: String(input.timezoneOffset) }),
      // Clear all cached data — will be regenerated on next report fetch
      chartData: null,
      chartComputedAt: null,
      chartSvgKeys: null,
      ashtakvargaSvgKeys: null,
      chartD1Key: null,
      chartD9Key: null,
      updatedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'kundli.profileUpdated',
    targetType: 'kundliProfile',
    targetId: profileId,
    summary: `Updated kundli profile "${updated.label}"`,
    beforeState: { label: existing.label, birthDate: existing.birthDate },
    afterState: { label: updated.label, birthDate: updated.birthDate },
  });

  void deleteProfileSvgs(customerId, profileId);
  return updated;
}

export async function deleteProfile(customerId: string, profileId: string) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);

  await prisma.kundliProfile.delete({ where: { id: profileId } });

  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'kundli.profileDeleted',
    targetType: 'kundliProfile',
    targetId: profileId,
    summary: `Deleted kundli profile "${profile.label}"`,
    beforeState: { label: profile.label },
  });

  void deleteProfileSvgs(customerId, profileId);
}

// ── Report (main birth chart data) ───────────────────────────────────────────

function filterPreBirthDasha(dasha: DashaPeriod[], birthDate: string): DashaPeriod[] {
  return dasha
    .filter((period) => period.endDate > birthDate)
    .map((period) => ({
      ...period,
      antars: period.antars
        .filter((a) => a.endDate > birthDate)
        .map((a) => ({
          ...a,
          pratyantar: (a as typeof a & { pratyantar?: typeof a.antars }).pratyantar?.filter(
            (pr) => pr.endDate > birthDate,
          ) ?? [],
        })),
    }));
}

export async function getReport(
  customerId: string,
  profileId: string,
  forceRefresh = false,
) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);

  type ChartData = Awaited<ReturnType<typeof getBirthChartData>>;
  let chartData = profile.chartData as ChartData | null;
  let svgKeys = (profile.chartSvgKeys ?? {}) as Record<string, string>;

  if (!chartData || !profile.chartComputedAt || forceRefresh) {
    const chartInput = buildChartInput(profile);
    chartData = await getBirthChartData(chartInput);

    // Upload D1 + D9 SVGs with standardised keys
    const [d1Key, d9Key] = await Promise.all([
      chartData.chartImageD1
        ? uploadSvg(chartSvgKey(customerId, profileId, 'D1'), chartData.chartImageD1)
        : null,
      chartData.chartImageD9
        ? uploadSvg(chartSvgKey(customerId, profileId, 'D9'), chartData.chartImageD9)
        : null,
    ]);

    svgKeys = {
      ...(d1Key ? { D1: d1Key } : {}),
      ...(d9Key ? { D9: d9Key } : {}),
    };

    // Strip raw SVG bytes before persisting — only store the keys
    const { chartImageD1: _d1, chartImageD9: _d9, ...chartDataWithoutSvg } = chartData;

    await prisma.kundliProfile.update({
      where: { id: profileId },
      data: {
        chartData: chartDataWithoutSvg,
        chartComputedAt: new Date(),
        chartSvgKeys: svgKeys,
        // Keep legacy columns in sync for backward compat
        chartD1Key: d1Key ?? null,
        chartD9Key: d9Key ?? null,
        updatedAt: new Date(),
      },
    });

    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: 'kundli.reportGenerated',
      targetType: 'kundliProfile',
      targetId: profileId,
      summary: `Generated kundli chart for "${profile.label}" (${profile.birthPlace})`,
    });
  }

  const showPreBirthDasha = await getSettingValue<boolean>('kundli.showPreBirthDasha', false);
  const dashaData = Array.isArray((chartData as Record<string, unknown>)?.['dasha'])
    ? (chartData as Record<string, unknown>)['dasha'] as DashaPeriod[]
    : [];

  const filteredDasha = showPreBirthDasha
    ? dashaData
    : filterPreBirthDasha(dashaData, profile.birthDate);

  // Resolve all stored SVG keys → public URLs
  const resolvedSvgUrls: Record<string, string | null> = {};
  for (const [div, key] of Object.entries(svgKeys)) {
    resolvedSvgUrls[div] = keyToUrl(key);
  }

  const responseData = {
    ...(chartData as Record<string, unknown>),
    dasha: filteredDasha,
    // Inject resolved URLs for all cached charts
    chartSvgUrls: resolvedSvgUrls,
    // Legacy top-level fields for backward compat
    chartImageD1: resolvedSvgUrls['D1'] ?? null,
    chartImageD9: resolvedSvgUrls['D9'] ?? null,
  };

  return {
    profile: { ...profile, chartComputedAt: profile.chartComputedAt ?? new Date() },
    chartData: responseData,
    cached: Boolean(profile.chartComputedAt),
    preBirthDashaShown: showPreBirthDasha,
  };
}

// ── Divisional chart — cached per div ────────────────────────────────────────

export async function getDivisionalChartForProfile(
  customerId: string,
  profileId: string,
  div: DivisionalDiv,
) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);

  const input = buildChartInput(profile);
  const data = await getDivisionalChart(input, div);

  // Fetch and cache the SVG for this div (get chart image from vedic API)
  let svgUrl: string | null = null;
  try {
    const { data: svgRaw } = await (await import('axios')).default.get<string>(
      'https://api.vedicastroapi.com/v3-json/horoscope/chart-image',
      {
        params: {
          ...buildVedicParams(input),
          div,
          style: 'north',
          format: 'svg',
          size: 400,
          api_key: process.env['VEDIC_ASTRO_API_KEY'],
        },
        responseType: 'text',
      },
    );
    if (typeof svgRaw === 'string' && svgRaw.trim().startsWith('<')) {
      const key = chartSvgKey(customerId, profileId, div);
      const uploaded = await uploadSvg(key, svgRaw);
      if (uploaded) {
        svgUrl = keyToUrl(uploaded);
        // Persist this key into chartSvgKeys
        const current = ((profile.chartSvgKeys ?? {}) as Record<string, string>);
        await prisma.kundliProfile.update({
          where: { id: profileId },
          data: { chartSvgKeys: { ...current, [div]: key } },
        });
      }
    }
  } catch (err) {
    logger.warn({ div, err }, '[kundli] divisional chart SVG fetch failed');
  }

  return { ...data, svgUrl };
}

// ── Ashtakvarga — cached per planet ──────────────────────────────────────────

export async function getAshtakvargaForProfile(
  customerId: string,
  profileId: string,
  planet: AshtakvargaPlanet,
) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);

  const input = buildChartInput(profile);
  const data = await getAshtakvarga(input, planet);

  let chartImageUrl: string | null = null;
  if (data.chartImage) {
    const key = ashtakvargaSvgKey(customerId, profileId, planet);
    const uploaded = await uploadSvg(key, data.chartImage);
    if (uploaded) {
      chartImageUrl = keyToUrl(uploaded);
      // Persist into ashtakvargaSvgKeys
      const current = ((profile.ashtakvargaSvgKeys ?? {}) as Record<string, string>);
      await prisma.kundliProfile.update({
        where: { id: profileId },
        data: { ashtakvargaSvgKeys: { ...current, [planet]: key } },
      }).catch(() => {}); // non-critical
    }
  } else {
    // Try to return previously cached URL
    const cached = ((profile.ashtakvargaSvgKeys ?? {}) as Record<string, string>)[planet];
    chartImageUrl = keyToUrl(cached);
  }

  return { ...data, chartImage: chartImageUrl };
}

// ── Dasha ─────────────────────────────────────────────────────────────────────

export async function getFullDashaForProfile(customerId: string, profileId: string) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);
  return getFullDashaData(buildChartInput(profile));
}

export async function getSpecificSubDashaForProfile(
  customerId: string,
  profileId: string,
  md: string,
  ad: string,
  pd: string,
  sd: string,
) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);
  return getSpecificSubDasha(buildChartInput(profile), md, ad, pd, sd);
}

// ── Kundli matching ───────────────────────────────────────────────────────────

export async function matchKundli(
  customerId: string,
  profileAId: string,
  profileBId: string,
) {
  const [profileA, profileB] = await Promise.all([
    prisma.kundliProfile.findFirst({ where: { id: profileAId, customerId } }),
    prisma.kundliProfile.findFirst({ where: { id: profileBId, customerId } }),
  ]);
  if (!profileA) throw new AppError('NOT_FOUND', 'Profile A not found.', 404);
  if (!profileB) throw new AppError('NOT_FOUND', 'Profile B not found.', 404);

  const result = await getKundliMatch(buildChartInput(profileA), buildChartInput(profileB));

  const match = await prisma.kundliMatch.create({
    data: {
      customerId,
      profileAId,
      profileBId,
      scorePoints: result.totalPoints,
      scoreLabel: result.scoreLabel,
      breakdown: result.breakdown as object,
    },
  });

  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'kundli.matchComputed',
    targetType: 'kundliMatch',
    targetId: match.id,
    summary: `Kundli match: ${profileA.label} ↔ ${profileB.label} — ${result.totalPoints}/36 (${result.scoreLabel})`,
    afterState: { profileAId, profileBId, scorePoints: result.totalPoints },
  });

  return { match, profileA, profileB, conclusion: result.conclusion, manglikBoy: result.manglikBoy, manglikGirl: result.manglikGirl };
}

export async function listMatches(customerId: string) {
  return prisma.kundliMatch.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: { profileA: true, profileB: true },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildChartInput(profile: {
  birthDate: string;
  birthTime: string | null;
  birthLat: string;
  birthLng: string;
  timezoneOffset: string;
}): BirthChartInput {
  const timePart = profile.birthTime ?? '12:00';
  const [year, month, day] = profile.birthDate.split('-').map(Number);
  const [hour, min] = timePart.split(':').map(Number);
  return {
    day, month, year,
    hour, min,
    lat: Number(profile.birthLat),
    lon: Number(profile.birthLng),
    tzone: Number(profile.timezoneOffset),
  };
}

function buildVedicParams(input: BirthChartInput): Record<string, unknown> {
  const dd = String(input.day).padStart(2, '0');
  const mm = String(input.month).padStart(2, '0');
  const hh = String(input.hour).padStart(2, '0');
  const mn = String(input.min).padStart(2, '0');
  return {
    dob: `${dd}/${mm}/${input.year}`,
    tob: `${hh}:${mn}`,
    lat: input.lat,
    lon: input.lon,
    tz: input.tzone,
  };
}
