import * as repo from './astrologers.repository.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { Astrologer } from '../../db/schema/astrologers.js';
import type { z } from 'zod';
import type { UpdateAstrologerProfileSchema, SearchAstrologersQuerySchema } from './astrologers.schema.js';

export async function getProfile(astrologerId: string): Promise<Astrologer> {
  const a = await repo.findById(astrologerId);
  if (!a) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);
  return a;
}

export async function updateProfile(astrologerId: string, data: z.infer<typeof UpdateAstrologerProfileSchema>): Promise<Astrologer> {
  const before = await repo.findById(astrologerId);
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  const updated = await repo.update(astrologerId, data);
  if (!updated) throw new AppError('INTERNAL', 'Update failed.', 500);

  await writeAuditLog({
    actorType: 'astrologer',
    actorId: astrologerId,
    action: 'astrologer.updateProfile',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: 'Astrologer updated profile',
    beforeState: { displayName: before.displayName, pricePerMinChat: before.pricePerMinChat },
    afterState: { displayName: updated.displayName, pricePerMinChat: updated.pricePerMinChat },
  });

  return updated;
}

export async function setOnlineStatus(astrologerId: string, isOnline: boolean): Promise<void> {
  await repo.setOnlineStatus(astrologerId, isOnline);
  await writeAuditLog({
    actorType: 'astrologer',
    actorId: astrologerId,
    action: 'astrologer.presenceChange',
    summary: `Astrologer went ${isOnline ? 'online' : 'offline'}`,
    afterState: { isOnline },
  });
}

export async function searchAstrologers(params: z.infer<typeof SearchAstrologersQuerySchema>) {
  return repo.search(params);
}

export async function getPublicProfile(astrologerId: string): Promise<Omit<Astrologer, 'kycDocsRef' | 'bankAccountRef' | 'commissionPct' | 'totalEarnings'>> {
  const a = await repo.findById(astrologerId);
  if (!a || a.isBlocked || !a.isVerified) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);
  const { kycDocsRef: _k, bankAccountRef: _b, commissionPct: _c, totalEarnings: _t, ...pub } = a;
  return pub;
}
