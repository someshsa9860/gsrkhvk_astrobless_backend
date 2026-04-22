/**
 * Upload routes:
 *
 * New pre-signed flow (preferred for all clients):
 *   GET  /{persona}/upload/presign?category=&contentType=
 *        → { uploadUrl, tempKey }
 *        Client PUTs the file directly to uploadUrl (S3/local).
 *        Client stores tempKey and submits it with the form.
 *        Backend calls moveFromTempIfNeeded(tempKey) on form submit.
 *
 * Legacy server-side flow (admin internal + backward compat):
 *   POST /{persona}/upload/image  multipart/form-data
 *        → { variants: { original, sm, md, lg }, prefix }
 *
 * Local dev: a PUT /uploads-presign/:token route is registered in the local dev setup
 * (see localPresignUploadRoute) to accept the direct upload in lieu of S3.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JWT_AUDIENCE } from '../../config/constants.js';
import { uploadImage, parseUploadFromRequest } from './uploadService.js';
import { getStorage } from '../../lib/storage/index.js';
import { makeTempKey } from '../../lib/tempFile.js';
import type { ImageCategory } from '../../lib/storage/types.js';

const ALLOWED_CUSTOMER_CATEGORIES: ImageCategory[] = ['profiles'];
const ALLOWED_ASTROLOGER_CATEGORIES: ImageCategory[] = ['profiles', 'kyc'];
const ALL_CATEGORIES: ImageCategory[] = [
  'profiles', 'banners', 'kyc', 'products', 'articles', 'pujas', 'stories', 'videos',
];

const VALID_CONTENT_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'application/pdf',
];

// ── Presign response schema ───────────────────────────────────────────────────

const PresignResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    uploadUrl: z.string().describe('Pre-signed PUT URL — upload file directly here'),
    tempKey: z.string().describe('Storage key to submit with your form; backend will finalize it'),
    expiresIn: z.number().describe('URL validity in seconds'),
  }),
});

const PresignQuerySchema = z.object({
  category: z.string(),
  contentType: z.string(),
});

// ── Legacy upload response schema ─────────────────────────────────────────────

const UploadResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    variants: z.object({
      original: z.string(),
      sm: z.string(),
      md: z.string(),
      lg: z.string(),
    }),
    prefix: z.string(),
  }),
});

// ── Presign handler ───────────────────────────────────────────────────────────

async function handlePresign(
  req: FastifyRequest,
  reply: FastifyReply,
  allowedCategories: ImageCategory[],
  getUserId: (req: FastifyRequest) => string,
) {
  const { category, contentType } = req.query as { category?: string; contentType?: string };

  if (!category || !allowedCategories.includes(category as ImageCategory)) {
    return reply.status(400).send({
      ok: false,
      error: { code: 'VALIDATION', message: `category must be one of: ${allowedCategories.join(', ')}` },
    });
  }
  if (!contentType || !VALID_CONTENT_TYPES.includes(contentType)) {
    return reply.status(400).send({
      ok: false,
      error: { code: 'VALIDATION', message: `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}` },
    });
  }

  const userId = getUserId(req);
  const tempKey = makeTempKey(category as ImageCategory, userId, contentType);
  const ttlSeconds = 900; // 15 minutes
  const uploadUrl = await getStorage().presignedUpload(tempKey, contentType, ttlSeconds);

  return reply.send({
    ok: true,
    data: { uploadUrl, tempKey, expiresIn: ttlSeconds },
  });
}

// ── Legacy multipart handler ──────────────────────────────────────────────────

async function handleUpload(
  req: FastifyRequest,
  reply: FastifyReply,
  allowedCategories: ImageCategory[],
) {
  const { category, entityId, subFolder } = (req.query as any);

  if (!category || !allowedCategories.includes(category as ImageCategory)) {
    return reply.status(400).send({ ok: false, error: { code: 'VALIDATION', message: `category must be one of: ${allowedCategories.join(', ')}` } });
  }
  if (!entityId) {
    return reply.status(400).send({ ok: false, error: { code: 'VALIDATION', message: 'entityId is required' } });
  }

  const { buffer, mimeType } = await parseUploadFromRequest(req);
  const result = await uploadImage({
    buffer,
    mimeType,
    category: category as ImageCategory,
    entityId,
    subFolder,
  });

  return reply.send({ ok: true, data: result });
}

// ── Route registrations ───────────────────────────────────────────────────────

export const adminUploadRoutes: FastifyPluginAsync = async (app) => {
  // Presign endpoint for admin
  app.get('/v1/admin/upload/presign', {
    schema: {
      tags: ['admin:upload'],
      summary: 'Request a pre-signed PUT URL for direct upload',
      description: 'Returns a temporary PUT URL and a tempKey. Upload directly to uploadUrl, then pass tempKey in the form body.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(PresignQuerySchema),
      response: { 200: zodToJsonSchema(PresignResponseSchema) },
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ADMIN)],
    handler: (req, reply) =>
      handlePresign(req, reply, ALL_CATEGORIES, (r) => (r as any).user?.sub ?? 'admin'),
  });

  // Legacy multipart upload (kept for internal admin tooling)
  app.post('/v1/admin/upload/image', {
    schema: {
      tags: ['admin:upload'],
      summary: 'Upload an image (admin — any category)',
      description: 'Generates sm/md/lg WebP variants. Returns public URLs.',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: { 200: zodToJsonSchema(UploadResponseSchema) },
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ADMIN)],
    handler: (req, reply) => handleUpload(req, reply, ALL_CATEGORIES),
  });
};

export const customerUploadRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/customer/upload/presign', {
    schema: {
      tags: ['customer:upload'],
      summary: 'Request a pre-signed PUT URL for direct upload',
      description: 'Returns a temporary PUT URL and tempKey for profile image upload.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(PresignQuerySchema),
      response: { 200: zodToJsonSchema(PresignResponseSchema) },
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: (req, reply) =>
      handlePresign(req, reply, ALLOWED_CUSTOMER_CATEGORIES, (r) => (r as any).user?.sub ?? 'unknown'),
  });

  // Legacy multipart (kept for backward compat)
  app.post('/v1/customer/upload/image', {
    schema: {
      tags: ['customer:upload'],
      summary: 'Upload an image (profile photo)',
      description: 'Generates sm/md/lg WebP variants. Returns public URLs.',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: { 200: zodToJsonSchema(UploadResponseSchema) },
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.CUSTOMER)],
    handler: (req, reply) =>
      handleUpload(req, reply, ALLOWED_CUSTOMER_CATEGORIES),
  });
};

export const astrologerUploadRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/astrologer/upload/presign', {
    schema: {
      tags: ['astrologer:upload'],
      summary: 'Request a pre-signed PUT URL for direct upload',
      description: 'Returns a temporary PUT URL and tempKey for profile or KYC uploads.',
      security: [{ bearerAuth: [] }],
      querystring: zodToJsonSchema(PresignQuerySchema),
      response: { 200: zodToJsonSchema(PresignResponseSchema) },
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: (req, reply) =>
      handlePresign(req, reply, ALLOWED_ASTROLOGER_CATEGORIES, (r) => (r as any).user?.sub ?? 'unknown'),
  });

  // Legacy multipart (kept for backward compat)
  app.post('/v1/astrologer/upload/image', {
    schema: {
      tags: ['astrologer:upload'],
      summary: 'Upload an image (profile photo or KYC document)',
      description: 'Generates sm/md/lg WebP variants. Returns public URLs.',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: { 200: zodToJsonSchema(UploadResponseSchema) },
    },
    preHandler: [app.requireAudience(JWT_AUDIENCE.ASTROLOGER)],
    handler: (req, reply) =>
      handleUpload(req, reply, ALLOWED_ASTROLOGER_CATEGORIES),
  });
};

/**
 * Local dev only: accepts PUT /uploads-presign/:token and writes the body
 * to the local storage path registered for that token.
 * Register this in the Fastify app only when STORAGE_PROVIDER=local.
 */
export const localPresignUploadRoute: FastifyPluginAsync = async (app) => {
  app.put('/uploads-presign/:token', {
    config: { rawBody: true },
    handler: async (req, reply) => {
      const { token } = req.params as { token: string };
      const { localPresignTokens } = await import('../../lib/storage/localProvider.js');
      const entry = localPresignTokens.get(token);

      if (!entry) {
        return reply.status(404).send({ error: 'Token not found or expired' });
      }
      if (Date.now() > entry.expiresAt) {
        localPresignTokens.delete(token);
        return reply.status(410).send({ error: 'Token expired' });
      }

      localPresignTokens.delete(token);

      const { getStorage } = await import('../../lib/storage/index.js');
      const storage = getStorage();
      const body = req.body as Buffer;
      if (!body || body.length === 0) {
        return reply.status(400).send({ error: 'Empty body' });
      }

      await storage.upload(entry.key, body, entry.contentType);
      return reply.status(200).send();
    },
  });
};
