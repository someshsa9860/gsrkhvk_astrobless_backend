import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { getBirthChartData, type BirthChartInput, type DashaPeriod } from '../../lib/vedicAstroClient.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { getSettingValue } from '../../admin/settings/adminSettings.service.js';
import type { z } from 'zod';
import type { CreateKundliProfileSchema } from './kundli.schema.js';

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

export async function getReport(customerId: string, profileId: string) {
  const profile = await prisma.kundliProfile.findFirst({
    where: { id: profileId, customerId },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'Kundli profile not found.', 404);

  let chartData = profile.chartData as ReturnType<typeof getBirthChartData> extends Promise<infer T> ? T : never | null;

  if (!chartData || !profile.chartComputedAt) {
    const timePart = profile.birthTime ?? '12:00';
    const [year, month, day] = profile.birthDate.split('-').map(Number);
    const [hour, min] = timePart.split(':').map(Number);

    const chartInput: BirthChartInput = {
      day, month, year,
      hour, min,
      lat: Number(profile.birthLat),
      lon: Number(profile.birthLng),
      tzone: Number(profile.timezoneOffset),
    };

    chartData = await getBirthChartData(chartInput) as typeof chartData;

    await prisma.kundliProfile.update({
      where: { id: profileId },
      data: { chartData, chartComputedAt: new Date(), updatedAt: new Date() },
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

  const responseData = { ...(chartData as Record<string, unknown>), dasha: filteredDasha };

  return {
    profile: { ...profile, chartComputedAt: profile.chartComputedAt ?? new Date() },
    chartData: responseData,
    cached: Boolean(profile.chartComputedAt),
    preBirthDashaShown: showPreBirthDasha,
  };
}
