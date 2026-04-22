import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor() {
    this.client = makeS3Client();
    this.bucket = env.STORAGE_PROVIDER === 'r2' ? env.R2_BUCKET : env.S3_BUCKET;
    this.baseUrl = env.STORAGE_PROVIDER === 'r2'
      ? env.R2_PUBLIC_URL || env.STORAGE_PUBLIC_URL
      : env.STORAGE_PUBLIC_URL;
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Files under public/ prefix are readable without signing.
        // For S3: bucket must have a public-read bucket policy on the public/ prefix.
        // For R2: set public access on the bucket.
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
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSeconds });
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
