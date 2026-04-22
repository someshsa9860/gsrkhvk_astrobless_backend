import { db } from '../../db/index.js';
import { appSettings } from '../../db/schema/adminExtras.js';
import { eq, like } from 'drizzle-orm';
import type { ImageCategory } from '../../lib/storage/types.js';
import type { AspectRatioConfig } from '../../lib/imageProcessor.js';
import { DEFAULT_ASPECT_RATIOS } from '../../lib/imageProcessor.js';

const SETTING_KEY_PREFIX = 'image.aspectRatio.';

function settingKey(category: ImageCategory): string {
  return `${SETTING_KEY_PREFIX}${category}`;
}

/** Read the admin-configured aspect ratio for a category. Returns null if not overridden. */
export async function getImageAspectRatioSetting(
  category: ImageCategory,
): Promise<AspectRatioConfig | null> {
  const key = settingKey(category);
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  if (rows.length === 0) return null;
  const v = rows[0].value as { width: number; height: number } | null;
  if (!v || typeof v.width !== 'number' || typeof v.height !== 'number') return null;
  return { width: v.width, height: v.height };
}

/** Read all category aspect ratios, filling defaults for unset ones. */
export async function getAllImageAspectRatios(): Promise<
  Record<ImageCategory, AspectRatioConfig>
> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(like(appSettings.key, `${SETTING_KEY_PREFIX}%`));

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
