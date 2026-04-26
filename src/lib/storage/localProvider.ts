import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import type { StorageProvider, UploadResult } from './types.js';

// Local dev upload token: clients PUT to /uploads-presign/:token
// This map holds pending tokens so the upload handler can resolve them.
export const localPresignTokens = new Map<string, { key: string; contentType: string; expiresAt: number }>();

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor() {
    this.root = path.resolve(env.STORAGE_LOCAL_PATH);
    this.baseUrl = env.STORAGE_PUBLIC_URL;
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    const filePath = path.join(this.root, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return {
      key,
      url: this.publicUrl(key),
      contentType,
      sizeBytes: buffer.length,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.root, key);
    await fs.unlink(filePath).catch(() => undefined);
  }

  publicUrl(key: string): string {
    // Serve via /uploads/:key — @fastify/static mounts STORAGE_LOCAL_PATH at /uploads
    return `${this.baseUrl}/uploads/${key}`;
  }

  async listKeys(prefix: string): Promise<string[]> {
    const dir = path.join(this.root, prefix);
    const keys: string[] = [];
    try {
      await this._walk(dir, prefix, keys);
    } catch {
      // directory may not exist yet
    }
    return keys;
  }

  private async _walk(dir: string, prefix: string, out: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = path.join(prefix, e.name);
      if (e.isDirectory()) {
        await this._walk(path.join(dir, e.name), rel, out);
      } else {
        out.push(rel);
      }
    }
  }

  async presignedUpload(key: string, contentType: string, ttlSeconds = 900): Promise<string> {
    const { randomUUID } = await import('node:crypto');
    const token = randomUUID();
    localPresignTokens.set(token, {
      key,
      contentType,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    // The local presign PUT handler is mounted at /uploads-presign/:token
    return `${this.baseUrl}/uploads-presign/${token}`;
  }

  async presignedDownload(key: string, _ttlSeconds?: number): Promise<string> {
    // Local dev: signed downloads are just public URLs (no auth needed locally)
    return this.publicUrl(key);
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const src = path.join(this.root, sourceKey);
    const dst = path.join(this.root, destKey);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.root, key));
      return true;
    } catch {
      return false;
    }
  }
}
