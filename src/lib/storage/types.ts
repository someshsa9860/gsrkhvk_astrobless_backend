export interface UploadResult {
  /** Storage-relative key, e.g. "public/profiles/abc123/original.jpg" */
  key: string;
  /** Fully qualified public URL (no presigned params) */
  url: string;
  /** MIME type of the stored file */
  contentType: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface StorageProvider {
  /**
   * Upload raw buffer to a given key under the provider's root.
   * Keys that start with "public/" are served without auth.
   */
  upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult>;

  /** Delete a key. Resolves even if the key doesn't exist. */
  delete(key: string): Promise<void>;

  /** Returns the public URL for a key without signing it. */
  publicUrl(key: string): string;

  /** List all keys under a prefix (for re-optimization jobs). */
  listKeys(prefix: string): Promise<string[]>;

  /**
   * Generate a pre-signed PUT URL for direct client-to-storage upload.
   * @param key      The storage key the client will PUT to.
   * @param contentType  MIME type the client must send in the Content-Type header.
   * @param ttlSeconds   URL validity period in seconds (default: 900 = 15 min).
   */
  presignedUpload(key: string, contentType: string, ttlSeconds?: number): Promise<string>;

  /**
   * Copy a key within the same bucket/store (used to move temp → permanent).
   * Destination is overwritten if it already exists.
   */
  copy(sourceKey: string, destKey: string): Promise<void>;

  /** Returns true if the key exists in storage. */
  exists(key: string): Promise<boolean>;
}

/** Image categories — determines the folder and default aspect ratio settings. */
export type ImageCategory =
  | 'profiles'
  | 'banners'
  | 'kyc'
  | 'products'
  | 'articles'
  | 'pujas'
  | 'stories'
  | 'videos';

/** Variant sizes generated for every uploaded image. */
export type ImageVariant = 'sm' | 'md' | 'lg';

/** Storage keys for all variants of an uploaded image (never URLs). */
export interface ImageVariantKeys {
  original: string;
  sm: string;
  md: string;
  lg: string;
}

/** Resolved public URLs for all image variants (generated at read time from keys). */
export interface ImageVariantUrls {
  original: string;
  sm: string;
  md: string;
  lg: string;
}

/** @deprecated Use ImageVariantKeys for storage, ImageVariantUrls for API responses. */
export type ImageVariants = ImageVariantKeys;
