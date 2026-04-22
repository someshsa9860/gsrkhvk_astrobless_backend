/**
 * Temp file utilities for the pre-signed upload flow.
 *
 * Upload lifecycle:
 *   1. Client requests a pre-signed PUT URL → backend returns { uploadUrl, tempKey }
 *   2. Client uploads directly to S3 at tempKey (temp/{YYYY-MM-DD}/{category}/{userId}/{uuid}/original.{ext})
 *   3. Client submits the form with tempKey as the file field value
 *   4. Backend calls moveFromTempIfNeeded(tempKey, category) → moves to permanent path,
 *      generates WebP variants, deletes the temp original, returns permanent key
 *
 * Key formats:
 *   Temp:      temp/{YYYY-MM-DD}/{category}/{userId}/{uuid}/original.{ext}
 *   Permanent: {category}/{userId}/{uuid}/original.{ext}  (+ sm/md/lg variants)
 *
 * Weekly cleanup job deletes all temp/{date}/... objects where date < 7 days ago.
 */

import { randomUUID } from 'node:crypto';
import { getStorage } from './storage/index.js';
import { processImage, DEFAULT_ASPECT_RATIOS, isValidImageMime } from './imageProcessor.js';
import type { ImageCategory } from './storage/types.js';
import { logger } from './logger.js';

// ── Key builders ──────────────────────────────────────────────────────────────

/** Build a temp key: temp/{YYYY-MM-DD}/{category}/{userId}/{uuid}/original.{ext} */
export function makeTempKey(
  category: ImageCategory,
  userId: string,
  contentType: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const uuid = randomUUID();
  const ext = mimeToExt(contentType);
  return `temp/${date}/${category}/${userId}/${uuid}/original.${ext}`;
}

/** True if the key is a temp key (starts with "temp/"). */
export function isTempKey(key: string): boolean {
  return key.startsWith('temp/');
}

/**
 * Derive the permanent key prefix from a temp key.
 * temp/{date}/{category}/{userId}/{uuid}/original.{ext}
 *   → {category}/{userId}/{uuid}
 */
export function permanentPrefixFromTemp(tempKey: string): { category: ImageCategory; userId: string; uuid: string; ext: string } | null {
  // Expected: temp / {date} / {category} / {userId} / {uuid} / original.{ext}
  const parts = tempKey.split('/');
  if (parts.length < 6 || parts[0] !== 'temp') return null;
  const [, /* temp */, /* date */, category, userId, uuid, filename] = parts;
  const ext = filename?.split('.').pop() ?? 'jpg';
  return { category: category as ImageCategory, userId, uuid, ext };
}

// ── Main utility ──────────────────────────────────────────────────────────────

export interface MoveResult {
  /** Permanent storage key for the original file */
  originalKey: string;
  /** Public URL for the original */
  originalUrl: string;
  /** Variant public URLs */
  variants: {
    original: string;
    sm: string;
    md: string;
    lg: string;
  };
}

/**
 * Move a file from its temp location to permanent storage and generate WebP variants.
 *
 * - If key is a temp key: downloads the original, processes variants, uploads permanent
 *   copies, deletes the temp original, returns the permanent key.
 * - If key is already permanent: verifies it exists and returns it as-is (variants may
 *   already exist from a previous call).
 * - If the file doesn't exist: returns null.
 *
 * This is idempotent — calling it twice with the same temp key is safe because after the
 * first call the temp key no longer exists and the function detects that and returns null.
 * Callers should only ever call this once per submit.
 */
export async function moveFromTempIfNeeded(
  key: string,
  category?: ImageCategory,
): Promise<MoveResult | null> {
  const storage = getStorage();

  if (!isTempKey(key)) {
    // Already a permanent key — verify it exists
    const ok = await storage.exists(key);
    if (!ok) {
      logger.warn({ key }, '[tempFile] moveFromTempIfNeeded: permanent key not found');
      return null;
    }
    const url = storage.publicUrl(key);
    // Build the expected variant URLs from the permanent key structure
    const prefix = key.substring(0, key.lastIndexOf('/') + 1);
    return {
      originalKey: key,
      originalUrl: url,
      variants: {
        original: url,
        sm: storage.publicUrl(`${prefix}sm.webp`),
        md: storage.publicUrl(`${prefix}md.webp`),
        lg: storage.publicUrl(`${prefix}lg.webp`),
      },
    };
  }

  // It's a temp key
  const parsed = permanentPrefixFromTemp(key);
  if (!parsed) {
    logger.warn({ key }, '[tempFile] moveFromTempIfNeeded: could not parse temp key');
    return null;
  }

  const tempExists = await storage.exists(key);
  if (!tempExists) {
    logger.warn({ key }, '[tempFile] moveFromTempIfNeeded: temp key not found');
    return null;
  }

  const effectiveCategory = (category ?? parsed.category) as ImageCategory;
  const permanentPrefix = `${effectiveCategory}/${parsed.userId}/${parsed.uuid}`;
  const permanentOriginalKey = `${permanentPrefix}/original.${parsed.ext}`;

  try {
    // Copy the original to permanent path
    await storage.copy(key, permanentOriginalKey);

    // Fetch the original buffer to generate WebP variants
    const originalBuffer = await fetchBuffer(key);
    const mimeType = mimeFromExt(parsed.ext);

    if (isValidImageMime(mimeType)) {
      const aspectRatio = DEFAULT_ASPECT_RATIOS[effectiveCategory] ?? { width: 1, height: 1 };
      const variants = await processImage(originalBuffer, mimeType, aspectRatio);

      // Upload sm/md/lg variants (skip the 'original' variant — already copied above)
      await Promise.all(
        variants
          .filter((v) => v.variant !== 'original')
          .map((v) =>
            storage.upload(
              `${permanentPrefix}/${v.filename}`,
              v.buffer,
              v.contentType,
            ),
          ),
      );
    }

    // Delete the temp original after successful permanent copy
    await storage.delete(key);

    const originalUrl = storage.publicUrl(permanentOriginalKey);
    return {
      originalKey: permanentOriginalKey,
      originalUrl,
      variants: {
        original: originalUrl,
        sm: storage.publicUrl(`${permanentPrefix}/sm.webp`),
        md: storage.publicUrl(`${permanentPrefix}/md.webp`),
        lg: storage.publicUrl(`${permanentPrefix}/lg.webp`),
      },
    };
  } catch (err) {
    logger.error({ key, err }, '[tempFile] moveFromTempIfNeeded failed');
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchBuffer(key: string): Promise<Buffer> {
  const storage = getStorage();

  if ((storage as any).root) {
    // LocalStorageProvider
    const { default: fs } = await import('node:fs/promises');
    const { default: path } = await import('node:path');
    const filePath = path.join((storage as any).root as string, key);
    return Buffer.from(await fs.readFile(filePath));
  }

  // S3 / R2 — use GetObject
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
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

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
  };
  return map[mime] ?? 'bin';
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf: 'application/pdf',
  };
  return map[ext.toLowerCase()] ?? 'application/octet-stream';
}
