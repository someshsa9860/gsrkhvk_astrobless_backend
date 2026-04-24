import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appleCredentials } from '../db/schema/appleCredentials.js';

export async function upsertAppleCredential(
  appleId: string,
  email: string | undefined,
  name: string | undefined,
): Promise<{ email: string | null; name: string | null }> {
  const existing = await db.query.appleCredentials.findFirst({
    where: eq(appleCredentials.appleId, appleId),
  });

  if (existing) {
    // Preserve non-null values — Apple only returns email/name on first sign-in
    const updates: Partial<typeof appleCredentials.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (email && !existing.email) updates.email = email;
    if (name && !existing.name) updates.name = name;

    if (Object.keys(updates).length > 1) {
      await db.update(appleCredentials)
        .set(updates)
        .where(eq(appleCredentials.appleId, appleId));
    }

    return {
      email: email ?? existing.email,
      name: name ?? existing.name,
    };
  }

  await db.insert(appleCredentials).values({
    appleId,
    email: email ?? null,
    name: name ?? null,
  });

  return { email: email ?? null, name: name ?? null };
}

export async function getAppleCredentialByAppleId(
  appleId: string,
): Promise<{ email: string | null; name: string | null } | null> {
  const row = await db.query.appleCredentials.findFirst({
    where: eq(appleCredentials.appleId, appleId),
  });
  if (!row) return null;
  return { email: row.email, name: row.name };
}
