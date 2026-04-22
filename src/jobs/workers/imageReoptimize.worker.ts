import { Worker } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { reprocessCategoryImages } from '../../modules/uploads/uploadService.js';
import type { ImageCategory, AspectRatioConfig } from '../../lib/storage/types.js';

export interface ImageReoptimizeJobData {
  category: ImageCategory;
  newAspectRatio: AspectRatioConfig;
  triggeredBy: string; // adminId
}

export const imageReoptimizeWorker = new Worker<ImageReoptimizeJobData>(
  'imageReoptimize',
  async (job) => {
    const { category, newAspectRatio, triggeredBy } = job.data;
    logger.info(
      { jobId: job.id, category, newAspectRatio, triggeredBy },
      'imageReoptimize: starting',
    );

    const result = await reprocessCategoryImages(category, newAspectRatio);

    logger.info(
      { jobId: job.id, category, ...result },
      'imageReoptimize: completed',
    );

    return result;
  },
  {
    connection: redis,
    concurrency: 2,
  },
);

imageReoptimizeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'imageReoptimize worker job failed');
});
