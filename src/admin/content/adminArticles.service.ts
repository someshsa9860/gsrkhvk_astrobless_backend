import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { ArticleListQuery, CreateArticleInput, UpdateArticleInput } from './adminArticles.schema.js';

export async function listArticles(q: ArticleListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.category)    where['category'] = q.category;
  if (q.language)    where['language'] = q.language;
  if (q.isPublished !== undefined) where['isPublished'] = q.isPublished;
  if (q.search) where['title'] = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.article.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
    prisma.article.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getArticle(id: string) {
  const row = await prisma.article.findFirst({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', `Article ${id} not found.`, 404);
  return row;
}

export async function createArticle(actorId: string, input: CreateArticleInput) {
  const existing = await prisma.article.findFirst({ where: { slug: input.slug } });
  if (existing) throw new AppError('VALIDATION', `Slug "${input.slug}" already in use.`, 400);
  const row = await prisma.article.create({
    data: {
      ...input,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : undefined,
      tags:        input.tags ?? [],
      createdBy:   actorId,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'article.create', targetType: 'article', targetId: row.id, summary: `Created article "${row.title}"` });
  return row;
}

export async function updateArticle(actorId: string, id: string, input: UpdateArticleInput) {
  const existing = await getArticle(id);
  const data: Record<string, unknown> = { ...input };
  if (input.publishedAt) data['publishedAt'] = new Date(input.publishedAt);
  const row = await prisma.article.update({ where: { id }, data });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'article.update', targetType: 'article', targetId: id, summary: `Updated article "${existing.title}"` });
  return row;
}

export async function deleteArticle(actorId: string, id: string) {
  const existing = await getArticle(id);
  await prisma.article.delete({ where: { id } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'article.delete', targetType: 'article', targetId: id, summary: `Deleted article "${existing.title}"` });
}

export async function publishArticle(actorId: string, id: string, publish: boolean) {
  await getArticle(id);
  await prisma.article.update({ where: { id }, data: { isPublished: publish, publishedAt: publish ? new Date() : null } });
  await writeAuditLog({ actorType: 'admin', actorId, action: publish ? 'article.publish' : 'article.unpublish', targetType: 'article', targetId: id, summary: `Article ${publish ? 'published' : 'unpublished'}` });
}
