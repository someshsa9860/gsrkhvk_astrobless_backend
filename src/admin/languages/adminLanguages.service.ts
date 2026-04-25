import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { LanguageListQuery, CreateLanguageInput, UpdateLanguageInput } from './adminLanguages.schema.js';

export async function listLanguages(q: LanguageListQuery) {
  const limit  = q.limit ?? 100;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.isActive !== undefined) where['isActive'] = q.isActive;
  if (q.search) where['OR'] = [
    { name:       { contains: q.search, mode: 'insensitive' } },
    { nativeName: { contains: q.search, mode: 'insensitive' } },
    { code:       { contains: q.search, mode: 'insensitive' } },
  ];

  const [items, total] = await Promise.all([
    prisma.language.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip: offset, take: limit }),
    prisma.language.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getLanguage(id: string) {
  const row = await prisma.language.findFirst({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', `Language ${id} not found.`, 404);
  return row;
}

export async function createLanguage(actorId: string, input: CreateLanguageInput) {
  const existing = await prisma.language.findFirst({ where: { code: input.code.toLowerCase() } });
  if (existing) throw new AppError('VALIDATION', `Language code "${input.code}" already exists.`, 400);

  const row = await prisma.language.create({
    data: {
      code:       input.code.toLowerCase(),
      name:       input.name,
      nativeName: input.nativeName,
      isActive:   input.isActive ?? true,
      sortOrder:  input.sortOrder ?? 0,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'language.create', targetType: 'language', targetId: row.id, summary: `Created language "${row.name}" (${row.code})` });
  return row;
}

export async function updateLanguage(actorId: string, id: string, input: UpdateLanguageInput) {
  const existing = await getLanguage(id);
  const data: Record<string, unknown> = { ...input };
  if (input.code) data['code'] = input.code.toLowerCase();
  const row = await prisma.language.update({ where: { id }, data });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'language.update', targetType: 'language', targetId: id, summary: `Updated language "${existing.name}"` });
  return row;
}

export async function deleteLanguage(actorId: string, id: string) {
  const existing = await getLanguage(id);
  await prisma.language.delete({ where: { id } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'language.delete', targetType: 'language', targetId: id, summary: `Deleted language "${existing.name}" (${existing.code})` });
}
