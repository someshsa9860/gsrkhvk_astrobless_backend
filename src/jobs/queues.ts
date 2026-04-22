import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

const connection = redis;

export const systemErrorIngestQueue = new Queue('systemErrorIngest', { connection });
export const notificationQueue = new Queue('notifications', { connection });
export const payoutQueue = new Queue('payouts', { connection });
export const fcmQueue = new Queue('fcm', { connection });
export const mediaScanQueue = new Queue('mediaScan', { connection });
export const horoscopeQueue = new Queue('horoscopeGeneration', { connection });
export const imageReoptimizeQueue = new Queue('imageReoptimize', { connection });
export const tempCleanupQueue = new Queue('tempCleanup', { connection });
