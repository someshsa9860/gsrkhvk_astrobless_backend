import { getStorage, type ImageVariantKeys, type ImageCategory } from '../../lib/storage/index.js';
import {
  processImage,
  buildKey,
  entityPrefix,
  isValidImageMime,
  MAX_UPLOAD_BYTES,
  type AspectRatioConfig,
  DEFAULT_ASPECT_RATIOS,
} from '../../lib/imageProcessor.js';
import { AppError } from '../../lib/errors.js';
import type { FastifyRequest } from 'fastify';

export interface UploadImageInput {
  buffer: Buffer;
  mimeType: string;
  category: ImageCategory;
  entityId: string;
  /** Optional sub-folder inside the entity dir, e.g. "aadhaar", "pan", "selfie" for KYC */
  subFolder?: string;
  /** Override the default aspect ratio for this category */
  aspectRatio?: AspectRatioConfig;
}

export interface UploadImageResult {
  /** Storage keys for each variant — save these to DB, never the URLs */
  keys: ImageVariantKeys;
  /** The storage key prefix for this entity's images */
  prefix: string;
}

/** Resolve effective aspect ratio: passed override > DB setting > default */
export async function resolveAspectRatio(
  category: ImageCategory,
  override?: AspectRatioConfig,
): Promise<AspectRatioConfig> {
  if (override) return override;
  // Dynamic import to avoid circular dependency with settings module
  try {
    const { getImageAspectRatioSetting } = await import('../settings/imageSettings.js');
    const saved = await getImageAspectRatioSetting(category);
    if (saved) return saved;
  } catch {
    // settings module may not be initialized yet in tests
  }
  return DEFAULT_ASPECT_RATIOS[category];
}

/**
 * Upload an image, generate sm/md/lg WebP variants, and store all four files.
 * Returns storage KEYS (not URLs) — callers must resolve keys to URLs at read time.
 */
export async function uploadImage(input: UploadImageInput): Promise<UploadImageResult> {
  const { buffer, mimeType, category, entityId, subFolder, aspectRatio } = input;

  if (!isValidImageMime(mimeType)) {
    throw new AppError('VALIDATION', `Unsupported image type: ${mimeType}`, 400);
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError('VALIDATION', `Image too large. Max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`, 413);
  }

  const effectiveAspectRatio = await resolveAspectRatio(category, aspectRatio);
  const storage = getStorage();
  const processed = await processImage(buffer, mimeType, effectiveAspectRatio);

  const uploads = await Promise.all(
    processed.map((p) =>
      storage.upload(
        buildKey(category, entityId, p.filename, subFolder),
        p.buffer,
        p.contentType,
      ),
    ),
  );

  // Store keys, not URLs — URLs are generated at read time via storage.publicUrl(key)
  const byVariant = Object.fromEntries(uploads.map((u, i) => [processed[i].variant, u.key]));

  return {
    keys: {
      original: byVariant['original'],
      sm: byVariant['sm'],
      md: byVariant['md'],
      lg: byVariant['lg'],
    },
    prefix: entityPrefix(category, entityId, subFolder),
  };
}

/**
 * Delete all variant files for an entity.
 * Called when an astrologer profile image is replaced or a banner is deleted.
 */
export async function deleteImageVariants(
  category: ImageCategory,
  entityId: string,
  subFolder?: string,
): Promise<void> {
  const storage = getStorage();
  const prefix = entityPrefix(category, entityId, subFolder);
  const keys = await storage.listKeys(prefix);
  await Promise.all(keys.map((k) => storage.delete(k)));
}

/**
 * Re-process all original images under a given category with a new aspect ratio.
 * Called by the BullMQ reoptimize job when an admin changes a category's aspect ratio.
 */
export async function reprocessCategoryImages(
  category: ImageCategory,
  newAspectRatio: AspectRatioConfig,
): Promise<{ processed: number; errors: number }> {
  const storage = getStorage();
  const prefix = `public/${category}/`;
  const allKeys = await storage.listKeys(prefix);

  // Find only original files
  const originals = allKeys.filter((k) => {
    const filename = k.split('/').pop() ?? '';
    return filename.startsWith('original.');
  });

  let processed = 0;
  let errors = 0;

  for (const originalKey of originals) {
    try {
      // Derive entityId and optional subFolder from key structure
      // Key: "public/{category}/{entityId}/{subFolder?}/original.{ext}"
      const parts = originalKey.split('/');
      // parts[0]=public, parts[1]=category, parts[2]=entityId, parts[3..n-1]=subFolder parts, parts[n]=filename
      const entityId = parts[2];
      const subFolderParts = parts.slice(3, -1);
      const subFolder = subFolderParts.length > 0 ? subFolderParts.join('/') : undefined;

      // For re-processing we need the original buffer from storage.
      // Local: read from disk. S3/R2: we need to fetch it.
      // We use a shared helper that works for both.
      const originalBuffer = await fetchStoredBuffer(originalKey);
      const originalMime = mimeFromKey(originalKey);

      const variants = await processImage(originalBuffer, originalMime, newAspectRatio);

      // Only re-upload the WebP variants (sm/md/lg), not the original
      await Promise.all(
        variants
          .filter((v) => v.variant !== 'original')
          .map((v) =>
            storage.upload(
              buildKey(category, entityId, v.filename, subFolder),
              v.buffer,
              v.contentType,
            ),
          ),
      );
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}

/** Read a stored buffer by key. Works for both local and S3 providers. */
async function fetchStoredBuffer(key: string): Promise<Buffer> {
  const storage = getStorage();

  if ((storage as any).root) {
    // LocalStorageProvider
    const { default: fs } = await import('node:fs/promises');
    const { default: path } = await import('node:path');
    const filePath = path.join((storage as any).root, key);
    return Buffer.from(await fs.readFile(filePath));
  }

  // S3 / R2 — use GetObject
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { env } = await import('../../config/env.js');
  const client = (storage as any).client as S3Client;
  const bucket = (storage as any).bucket as string;

  const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!Body) throw new Error(`Empty body for key: ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function mimeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return map[ext] ?? 'image/jpeg';
}

/** Parse a multipart upload from a Fastify request. Returns buffer + mime type. */
export async function parseUploadFromRequest(
  req: FastifyRequest,
): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
  const data = await (req as any).file();
  if (!data) throw new AppError('VALIDATION', 'No file uploaded', 400);

  const chunks: Buffer[] = [];
  for await (const chunk of data.file) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return { buffer, mimeType: data.mimetype as string, originalName: data.filename as string };
}
