import sharp from 'sharp';
import path from 'node:path';
import type { ImageCategory, ImageVariant } from './storage/types.js';

/** Dimensions for each variant. Width drives the resize; height is set by aspect ratio. */
const VARIANT_WIDTHS: Record<ImageVariant, number> = {
  sm: 120,
  md: 400,
  lg: 1200,
};

/** WebP quality per variant (sm uses lower quality to minimise bandwidth). */
const VARIANT_QUALITY: Record<ImageVariant, number> = {
  sm: 72,
  md: 82,
  lg: 88,
};

export interface AspectRatioConfig {
  width: number;
  height: number;
}

/** Default aspect ratios per category. Admin can override via appSettings. */
export const DEFAULT_ASPECT_RATIOS: Record<ImageCategory, AspectRatioConfig> = {
  profiles: { width: 1, height: 1 },     // square avatars
  banners: { width: 16, height: 9 },     // wide banners
  kyc: { width: 4, height: 3 },          // document scans
  products: { width: 1, height: 1 },     // square product images
  articles: { width: 16, height: 9 },    // article cover
  pujas: { width: 4, height: 3 },        // puja templates
  stories: { width: 9, height: 16 },     // portrait stories
  videos: { width: 16, height: 9 },      // video thumbnails
};

export interface ProcessedVariant {
  variant: ImageVariant | 'original';
  buffer: Buffer;
  contentType: string;
  /** Relative filename: "sm.webp", "md.webp", "lg.webp", "original.jpg" */
  filename: string;
}

/**
 * Given a raw image buffer, produce the original (preserved as-is) and
 * three WebP variants at sm/md/lg widths cropped to the given aspect ratio.
 */
export async function processImage(
  inputBuffer: Buffer,
  originalMime: string,
  aspectRatio: AspectRatioConfig,
): Promise<ProcessedVariant[]> {
  const ext = mimeToExt(originalMime);
  const results: ProcessedVariant[] = [
    {
      variant: 'original',
      buffer: inputBuffer,
      contentType: originalMime,
      filename: `original.${ext}`,
    },
  ];

  for (const variant of ['sm', 'md', 'lg'] as ImageVariant[]) {
    const w = VARIANT_WIDTHS[variant];
    const h = Math.round((w / aspectRatio.width) * aspectRatio.height);
    const webpBuffer = await sharp(inputBuffer)
      .resize(w, h, { fit: 'cover', position: 'attention' })
      .webp({ quality: VARIANT_QUALITY[variant] })
      .toBuffer();

    results.push({
      variant,
      buffer: webpBuffer,
      contentType: 'image/webp',
      filename: `${variant}.webp`,
    });
  }

  return results;
}

/**
 * Build the storage key for a file.
 * Keys under "public/" are served without auth on all providers.
 *
 * @example
 *   buildKey('profiles', 'uuid-123', 'sm.webp')
 *   → "public/profiles/uuid-123/sm.webp"
 */
export function buildKey(
  category: ImageCategory,
  entityId: string,
  filename: string,
  subFolder?: string,
): string {
  const parts = ['public', category, entityId];
  if (subFolder) parts.push(subFolder);
  parts.push(filename);
  return parts.join('/');
}

/** The folder prefix for all files belonging to an entity. */
export function entityPrefix(
  category: ImageCategory,
  entityId: string,
  subFolder?: string,
): string {
  const parts = ['public', category, entityId];
  if (subFolder) parts.push(subFolder);
  return parts.join('/') + '/';
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[mime] ?? 'bin';
}

export function isValidImageMime(mime: string): boolean {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime);
}

/** Maximum upload size: 15 MB */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
