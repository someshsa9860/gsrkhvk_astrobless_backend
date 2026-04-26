import { env } from '../../config/env.js';
import { LocalStorageProvider } from './localProvider.js';
import { S3StorageProvider } from './s3Provider.js';
import type { StorageProvider, ImageVariantKeys, ImageVariantUrls } from './types.js';

export * from './types.js';

let _provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!_provider) {
    if (env.STORAGE_PROVIDER === 'local') {
      _provider = new LocalStorageProvider();
    } else {
      // s3 and r2 both use the S3-compatible client
      _provider = new S3StorageProvider();
    }
  }
  return _provider;
}

/** Resolve a storage key to its public URL. Returns null if key is null/undefined. */
export function keyToUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return getStorage().publicUrl(key);
}

/**
 * Generate a signed (time-limited) URL for a private file.
 * Uses CloudFront signed URL when CF is configured, S3 presigned GET otherwise.
 * Returns null if key is null/undefined.
 */
export async function signedUrl(
  key: string | null | undefined,
  ttlSeconds?: number,
): Promise<string | null> {
  if (!key) return null;
  return getStorage().presignedDownload(key, ttlSeconds);
}

/** Resolve an array of storage keys to public URLs. */
export function keysToUrls(keys: string[]): string[] {
  const storage = getStorage();
  return keys.map((k) => storage.publicUrl(k));
}

/** Resolve all variant keys to their public URLs. */
export function variantKeysToUrls(keys: ImageVariantKeys): ImageVariantUrls {
  const storage = getStorage();
  return {
    original: storage.publicUrl(keys.original),
    sm: storage.publicUrl(keys.sm),
    md: storage.publicUrl(keys.md),
    lg: storage.publicUrl(keys.lg),
  };
}
