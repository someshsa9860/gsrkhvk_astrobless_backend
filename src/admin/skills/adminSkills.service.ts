import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { SkillListQuery, CreateSkillInput, UpdateSkillInput } from './adminSkills.schema.js';

export async function listSkills(q: SkillListQuery) {
  const limit  = q.limit ?? 100;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.isActive !== undefined) where['isActive'] = q.isActive;
  if (q.category) where['category'] = q.category;
  if (q.search) where['OR'] = [
    { name:        { contains: q.search, mode: 'insensitive' } },
    { description: { contains: q.search, mode: 'insensitive' } },
    { slug:        { contains: q.search, mode: 'insensitive' } },
  ];

  const [items, total] = await Promise.all([
    prisma.skill.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip: offset, take: limit }),
    prisma.skill.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getSkill(id: string) {
  const row = await prisma.skill.findFirst({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', `Skill ${id} not found.`, 404);
  return row;
}

export async function createSkill(actorId: string, input: CreateSkillInput) {
  const existing = await prisma.skill.findFirst({ where: { slug: input.slug } });
  if (existing) throw new AppError('VALIDATION', `Skill slug "${input.slug}" already exists.`, 400);

  const row = await prisma.skill.create({
    data: {
      slug:        input.slug,
      name:        input.name,
      description: input.description,
      category:    input.category,
      isActive:    input.isActive ?? true,
      sortOrder:   input.sortOrder ?? 0,
    },
  });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'skill.create', targetType: 'skill', targetId: row.id, summary: `Created skill "${row.name}" (${row.slug})` });
  return row;
}

export async function updateSkill(actorId: string, id: string, input: UpdateSkillInput) {
  const existing = await getSkill(id);
  if (input.slug && input.slug !== existing.slug) {
    const dup = await prisma.skill.findFirst({ where: { slug: input.slug } });
    if (dup) throw new AppError('VALIDATION', `Skill slug "${input.slug}" already exists.`, 400);
  }
  const row = await prisma.skill.update({ where: { id }, data: input });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'skill.update', targetType: 'skill', targetId: id, summary: `Updated skill "${existing.name}"` });
  return row;
}

export async function deleteSkill(actorId: string, id: string) {
  const existing = await getSkill(id);
  await prisma.skill.delete({ where: { id } });
  await writeAuditLog({ actorType: 'admin', actorId, action: 'skill.delete', targetType: 'skill', targetId: id, summary: `Deleted skill "${existing.name}" (${existing.slug})` });
}
