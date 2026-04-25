import { prisma } from '../db/client.js';

export async function upsertAppleCredential(
  appleId: string,
  email: string | undefined,
  name: string | undefined,
): Promise<{ email: string | null; name: string | null }> {
  const existing = await prisma.appleCredential.findFirst({ where: { appleId } });

  if (existing) {
    const data: { email?: string; name?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (email && !existing.email) data.email = email;
    if (name && !existing.name) data.name = name;

    if (Object.keys(data).length > 1) {
      await prisma.appleCredential.update({ where: { appleId }, data });
    }

    return {
      email: email ?? existing.email,
      name: name ?? existing.name,
    };
  }

  await prisma.appleCredential.create({ data: { appleId, email: email ?? null, name: name ?? null } });
  return { email: email ?? null, name: name ?? null };
}

export async function getAppleCredentialByAppleId(
  appleId: string,
): Promise<{ email: string | null; name: string | null } | null> {
  const row = await prisma.appleCredential.findFirst({ where: { appleId } });
  if (!row) return null;
  return { email: row.email, name: row.name };
}
