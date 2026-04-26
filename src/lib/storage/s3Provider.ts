import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as cfSignedUrl } from '@aws-sdk/cloudfront-signer';
import { readFileSync } from 'fs';
import { env } from '../../config/env.js';
import type { StorageProvider, UploadResult } from './types.js';

function makeS3Client() {
  const isR2 = env.STORAGE_PROVIDER === 'r2';
  if (isR2) {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return new S3Client({
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Resolve the CloudFront private key from a file path or inline PEM string.
function resolveCloudFrontPrivateKey(): string {
  const raw = env.CLOUDFRONT_PRIVATE_KEY;
  if (!raw) return '';
  // File path
  if (raw.startsWith('/') || raw.startsWith('./')) {
    return readFileSync(raw, 'utf8');
  }
  // Inline PEM — replace literal \n with real newlines in case it was passed via env
  return raw.replace(/\\n/g, '\n');
}

let _cfPrivateKey: string | null = null;
function getCfPrivateKey(): string {
  if (_cfPrivateKey === null) _cfPrivateKey = resolveCloudFrontPrivateKey();
  return _cfPrivateKey;
}

function isCfEnabled(): boolean {
  return !!(env.CLOUDFRONT_DOMAIN && env.CLOUDFRONT_KEY_PAIR_ID && env.CLOUDFRONT_PRIVATE_KEY);
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor() {
    this.client = makeS3Client();
    this.bucket = env.STORAGE_PROVIDER === 'r2' ? env.R2_BUCKET : env.S3_BUCKET;
    // When CloudFront is configured, public URLs go through the CF domain.
    if (isCfEnabled()) {
      this.baseUrl = `https://${env.CLOUDFRONT_DOMAIN}`;
    } else {
      this.baseUrl = env.STORAGE_PROVIDER === 'r2'
        ? env.R2_PUBLIC_URL || env.STORAGE_PUBLIC_URL
        : env.STORAGE_PUBLIC_URL;
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return {
      key,
      url: this.publicUrl(key),
      contentType,
      sizeBytes: buffer.length,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    ).catch(() => undefined);
  }

  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);
    return keys;
  }

  async presignedUpload(key: string, contentType: string, ttlSeconds = 900): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return s3SignedUrl(this.client, cmd, { expiresIn: ttlSeconds });
  }

  async presignedDownload(key: string, ttlSeconds = env.CLOUDFRONT_URL_TTL_SECONDS): Promise<string> {
    if (isCfEnabled()) {
      const url = `https://${env.CLOUDFRONT_DOMAIN}/${key}`;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      return cfSignedUrl({
        url,
        keyPairId: env.CLOUDFRONT_KEY_PAIR_ID,
        privateKey: getCfPrivateKey(),
        dateLessThan: expiresAt.toISOString(),
      });
    }
    // Fallback: S3 presigned GET
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return s3SignedUrl(this.client, cmd, { expiresIn: ttlSeconds });
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
