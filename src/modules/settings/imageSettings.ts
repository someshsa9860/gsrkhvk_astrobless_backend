import { prisma } from '../../db/index.js';
import type { ImageCategory } from '../../lib/storage/types.js';
import type { AspectRatioConfig } from '../../lib/imageProcessor.js';
import { DEFAULT_ASPECT_RATIOS } from '../../lib/imageProcessor.js';

const SETTING_KEY_PREFIX = 'image.aspectRatio.';

function settingKey(category: ImageCategory): string {
  return `${SETTING_KEY_PREFIX}${category}`;
}

export async function getImageAspectRatioSetting(
  category: ImageCategory,
): Promise<AspectRatioConfig | null> {
  const key = settingKey(category);
  const setting = await prisma.appSetting.findFirst({ where: { key }, select: { value: true } });
  if (!setting) return null;
  const v = setting.value as { width: number; height: number } | null;
  if (!v || typeof v.width !== 'number' || typeof v.height !== 'number') return null;
  return { width: v.width, height: v.height };
}

export async function getAllImageAspectRatios(): Promise<Record<ImageCategory, AspectRatioConfig>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: SETTING_KEY_PREFIX } },
    select: { key: true, value: true },
  });

  const result = { ...DEFAULT_ASPECT_RATIOS };
  for (const row of rows) {
    const category = row.key.replace(SETTING_KEY_PREFIX, '') as ImageCategory;
    const v = row.value as { width: number; height: number } | null;
    if (v && typeof v.width === 'number') {
      result[category] = { width: v.width, height: v.height };
    }
  }
  return result;
}
