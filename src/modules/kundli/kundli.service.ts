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

// Upload an SVG string to managed storage and return the storage key.
// Keys always start with "public/" so they are accessible without auth
// (S3 bucket policy / CloudFront can enforce this at the CDN layer).
async function uploadChartSvg(
  profileId: string,
  div: 'D1' | 'D9',
  svgString: string,
): Promise<string> {
  const key = `public/kundli/charts/${profileId}/${div}.svg`;
  const buffer = Buffer.from(svgString, 'utf-8');
  await getStorage().upload(key, buffer, 'image/svg+xml');
  return key;
}

// Delete both chart SVGs from storage (fire-and-forget — never blocks the caller).
async function deleteChartSvgs(profileId: string): Promise<void> {
  const storage = getStorage();
  await Promise.all([
    storage.delete(`public/kundli/charts/${profileId}/D1.svg`),
    storage.delete(`public/kundli/charts/${profileId}/D9.svg`),
  ]).catch((err) => logger.warn({ err, profileId }, '[kundli] failed to delete old chart SVGs'))
}

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
      // Clear cached chart so it will be re-generated on next report fetch.
      // Delete old SVGs from storage (fire-and-forget).
      chartData: null,
      chartComputedAt: null,
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

  // Delete old chart SVGs after the DB update succeeds (fire-and-forget)
  void deleteChartSvgs(profileId);

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

  // Delete chart SVGs from storage (fire-and-forget)
  void deleteChartSvgs(profileId);
}

function filterPreBirthDasha(dasha: DashaPeriod[], birthDate: string): DashaPeriod[] {
  return dasha
    .filter((period) => period.endDate > birthDate)
    .map((period) => ({
      ...period,
      antars: period.antars
        .filter((a) => a.endDate > birthDate)
        .map((a) => ({
          ...a,
          pratyantar: a.pratyantar.filter((pr) => pr.endDate > birthDate),
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
  let d1Key = profile.chartD1Key as string | null;
  let d9Key = profile.chartD9Key as string | null;

  if (!chartData || !profile.chartComputedAt || forceRefresh) {
    const chartInput = buildChartInput(profile);
    chartData = await getBirthChartData(chartInput);

    // Upload chart SVGs to managed storage (public/ prefix → CDN-accessible).
    // The raw SVG strings from the API are stored once here; chartData itself
    // does NOT persist them so the DB stays lean.
    const [uploadedD1Key, uploadedD9Key] = await Promise.all([
      chartData.chartImageD1
        ? uploadChartSvg(profileId, 'D1', chartData.chartImageD1).catch((err) => {
            logger.warn({ err }, '[kundli] D1 SVG upload failed, skipping');
            return null;
          })
        : null,
      chartData.chartImageD9
        ? uploadChartSvg(profileId, 'D9', chartData.chartImageD9).catch((err) => {
            logger.warn({ err }, '[kundli] D9 SVG upload failed, skipping');
            return null;
          })
        : null,
    ]);
    d1Key = uploadedD1Key;
    d9Key = uploadedD9Key;

    // Strip raw SVG bytes before persisting chartData — store the key instead
    const { chartImageD1: _d1, chartImageD9: _d9, ...chartDataWithoutSvg } = chartData;

    await prisma.kundliProfile.update({
      where: { id: profileId },
      data: {
        chartData: chartDataWithoutSvg,
        chartComputedAt: new Date(),
        chartD1Key: d1Key,
        chartD9Key: d9Key,
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

  // Resolve storage keys → public URLs at response time
  const responseData = {
    ...(chartData as Record<string, unknown>),
    dasha: filteredDasha,
    chartImageD1: keyToUrl(d1Key),
    chartImageD9: keyToUrl(d9Key),
  };

  return {
    profile: { ...profile, chartComputedAt: profile.chartComputedAt ?? new Date() },
    chartData: responseData,
    cached: Boolean(profile.chartComputedAt),
    preBirthDashaShown: showPreBirthDasha,
  };
}

function buildChartInput(profile: {
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

export async function getDivisionalChartForProfile(
  customerId: string,
  profileId: string,
  div: DivisionalDiv,
) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);
  return getDivisionalChart(buildChartInput(profile), div);
}

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

  // Upload Ashtakvarga chart image to managed storage (public/ prefix).
  // Key: public/kundli/ashtakvarga/{profileId}/{planet}.svg
  // Not cached in DB — regenerated on each call but stored in storage.
  let chartImageUrl: string | null = null;
  if (data.chartImage) {
    const key = `public/kundli/ashtakvarga/${profileId}/${planet}.svg`;
    const uploaded = await getStorage()
      .upload(key, Buffer.from(data.chartImage, 'utf-8'), 'image/svg+xml')
      .catch((err) => {
        logger.warn({ err, planet }, '[kundli] ashtakvarga SVG upload failed');
        return null;
      });
    chartImageUrl = uploaded ? keyToUrl(uploaded.key) : null;
  }

  return { ...data, chartImage: chartImageUrl };
}

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
      scoreLabel:  result.scoreLabel,
      breakdown:   result.breakdown as object,
    },
  });

  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'kundli.matchComputed',
    targetType: 'kundliMatch',
    targetId: match.id,
    summary: `Kundli match computed: ${profileA.label} ↔ ${profileB.label} — ${result.totalPoints}/36 (${result.scoreLabel})`,
    afterState: { profileAId, profileBId, scorePoints: result.totalPoints },
  });

  return {
    match,
    profileA,
    profileB,
    conclusion: result.conclusion,
    manglikBoy:  result.manglikBoy,
    manglikGirl: result.manglikGirl,
  };
}

export async function listMatches(customerId: string) {
  return prisma.kundliMatch.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: { profileA: true, profileB: true },
  });
}
