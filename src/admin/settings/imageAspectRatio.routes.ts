/**
 * Admin image aspect-ratio settings.
 *
 * GET  /v1/admin/settings/images/aspect-ratios
 *   → all categories with current + default aspect ratios
 *
 * PATCH /v1/admin/settings/images/aspect-ratios/:category
 *   { width, height, reason, reoptimize? }
 *   → saves to appSettings, optionally enqueues a BullMQ reoptimize job
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { requirePermission, AdminPermission } from '../shared/rbac.js';
import { prisma } from '../../db/client.js';
import { getAllImageAspectRatios } from '../../modules/settings/imageSettings.js';
import { DEFAULT_ASPECT_RATIOS } from '../../lib/imageProcessor.js';
import { imageReoptimizeQueue } from '../../jobs/queues.js';
import type { ImageCategory } from '../../lib/storage/types.js';

const IMAGE_CATEGORIES: ImageCategory[] = [
  'profiles', 'banners', 'kyc', 'products', 'articles', 'pujas', 'stories', 'videos',
];

const UpdateAspectRatioSchema = z.object({
  width: z.number().int().min(1).max(100),
  height: z.number().int().min(1).max(100),
  reason: z.string().min(3),
  reoptimize: z.boolean().optional().default(false),
});

export const adminImageAspectRatioRoutes: FastifyPluginAsync = async (app) => {
  const audience = app.requireAudience(JWT_AUDIENCE.ADMIN);

  app.get('/v1/admin/settings/images/aspect-ratios', {
    schema: {
      tags: ['admin:settings'],
      summary: 'List image aspect ratios per category',
      description: 'Shows current aspect ratio and default for each image category.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [audience, requirePermission(AdminPermission.SETTINGS_VIEW)],
    handler: async (_req: FastifyRequest, reply: FastifyReply) => {
      const current = await getAllImageAspectRatios();
      const result = IMAGE_CATEGORIES.map((cat) => ({
        category: cat,
        current: current[cat],
        default: DEFAULT_ASPECT_RATIOS[cat],
        isCustom: JSON.stringify(current[cat]) !== JSON.stringify(DEFAULT_ASPECT_RATIOS[cat]),
      }));
      return reply.send({ ok: true, data: result });
    },
  });

  app.patch('/v1/admin/settings/images/aspect-ratios/:category', {
    schema: {
      tags: ['admin:settings'],
      summary: 'Update aspect ratio for an image category',
      description:
        'Saves the aspect ratio. If reoptimize=true, all existing images for the category are re-processed to the new ratio in a background job.',
      security: [{ bearerAuth: [] }],
      body: zodToJsonSchema(UpdateAspectRatioSchema),
    },
    preHandler: [audience, requirePermission(AdminPermission.SETTINGS_EDIT)],
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const { category } = req.params as { category: string };
      if (!IMAGE_CATEGORIES.includes(category as ImageCategory)) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'VALIDATION', message: `Unknown category: ${category}` },
        });
      }

      const body = UpdateAspectRatioSchema.parse(req.body);
      const adminId = (req as any).user?.sub as string;
      const key = `image.aspectRatio.${category}`;

      await prisma.appSetting.upsert({
        where: { key },
        create: {
          key,
          value: { width: body.width, height: body.height },
          description: `Aspect ratio for ${category} images`,
          category: 'image',
          updatedBy: adminId,
          updatedAt: new Date(),
        },
        update: {
          value: { width: body.width, height: body.height },
          updatedBy: adminId,
          updatedAt: new Date(),
        },
      });

      let jobId: string | null = null;
      if (body.reoptimize) {
        const job = await imageReoptimizeQueue.add(
          'reoptimize',
          {
            category: category as ImageCategory,
            newAspectRatio: { width: body.width, height: body.height },
            triggeredBy: adminId,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );
        jobId = job.id ?? null;
      }

      return reply.send({
        ok: true,
        data: {
          category,
          aspectRatio: { width: body.width, height: body.height },
          reoptimizeJobId: jobId,
        },
      });
    },
  });
};
