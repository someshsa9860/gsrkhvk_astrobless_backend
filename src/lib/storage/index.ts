import { env } from '../../config/env.js';
import { LocalStorageProvider } from './localProvider.js';
import { S3StorageProvider } from './s3Provider.js';
import type { StorageProvider } from './types.js';

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
