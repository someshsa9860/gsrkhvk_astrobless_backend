// Business logic for admin-facing astrologer management.

import { eq, ilike, desc, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { astrologers } from '../../db/schema/astrologers.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import type {
  AstrologerListQuery,
  KycDecisionInput,
  BlockAstrologerInput,
  CommissionOverrideInput,
  CreateAstrologerInput,
  UpdateAstrologerInput,
} from './adminAstrologers.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

// Runs list + count in parallel; kycStatus/isOnline/isBlocked all composable.
export async function listAstrologers(q: AstrologerListQuery) {
  const { offset, limit } = paginationFrom(q);
  const conditions = [];
  if (q.search) conditions.push(ilike(astrologers.displayName, `%${q.search}%`));
  if (q.kycStatus) conditions.push(eq(astrologers.kycStatus, q.kycStatus));
  if (q.isOnline !== undefined) conditions.push(eq(astrologers.isOnline, q.isOnline));
  if (q.isBlocked !== undefined) conditions.push(eq(astrologers.isBlocked, q.isBlocked));

  const where = conditions.length ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db.query.astrologers.findMany({ where, limit, offset, orderBy: [desc(astrologers.createdAt)] }),
    db.select({ count: sql<number>`count(*)` }).from(astrologers).where(where),
  ]);

  return toPagedResult(items, Number(countResult[0]?.count ?? 0), q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

// Returns full profile — kycDocsRef and bankAccountRef are returned as-is;
// callers must sign S3 URLs before sending to admin UI.
export async function getAstrologer(id: string) {
  const astrologer = await db.query.astrologers.findFirst({ where: eq(astrologers.id, id) });
  if (!astrologer) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);
  return astrologer;
}

// ── KYC decision ──────────────────────────────────────────────────────────────

// Approving KYC also flips isVerified so the astrologer appears in search.
export async function decideKyc(adminId: string, astrologerId: string, input: KycDecisionInput) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  const isApproved = input.decision === 'approved';
  await db
    .update(astrologers)
    .set({ kycStatus: input.decision, isVerified: isApproved, updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: isApproved ? 'astrologer.kycApprove' : 'astrologer.kycReject',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `KYC ${input.decision}. Note: ${input.note ?? 'none'}`,
    beforeState: { kycStatus: before.kycStatus, isVerified: before.isVerified },
    afterState: { kycStatus: input.decision, isVerified: isApproved },
    metadata: { note: input.note },
  });
}

// ── Block / Unblock ───────────────────────────────────────────────────────────

// Blocking an astrologer prevents them from going online or accepting consultations.
export async function blockAstrologer(adminId: string, astrologerId: string, input: BlockAstrologerInput) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await db
    .update(astrologers)
    .set({ isBlocked: true, blockedReason: input.reason, isOnline: false, updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.block',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Astrologer blocked. Reason: ${input.reason}`,
    beforeState: { isBlocked: before.isBlocked, isOnline: before.isOnline },
    afterState: { isBlocked: true, isOnline: false, blockedReason: input.reason },
  });
}

// Unblocking restores availability but does NOT auto-set isOnline — astrologer sets that themselves.
export async function unblockAstrologer(adminId: string, astrologerId: string) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await db
    .update(astrologers)
    .set({ isBlocked: false, blockedReason: null, updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.unblock',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: 'Astrologer unblocked.',
    beforeState: { isBlocked: before.isBlocked },
    afterState: { isBlocked: false },
  });
}

// ── Commission override ───────────────────────────────────────────────────────

// Overrides the astrologer's individual commission — takes effect on the next consultation.
export async function overrideCommission(adminId: string, astrologerId: string, input: CommissionOverrideInput) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await db
    .update(astrologers)
    .set({ commissionPct: String(input.commissionPct), updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.commissionOverride',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Commission changed to ${input.commissionPct}%. Reason: ${input.reason}`,
    beforeState: { commissionPct: before.commissionPct },
    afterState: { commissionPct: input.commissionPct },
    metadata: { reason: input.reason },
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAstrologer(adminId: string, input: CreateAstrologerInput) {
  const [created] = await db
    .insert(astrologers)
    .values({
      displayName: input.displayName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      whatsappNumber: input.whatsappNumber ?? null,
      legalName: input.legalName ?? null,
      registrationCountry: input.registrationCountry ?? null,
      panNumber: input.panNumber ?? null,
      profileImageUrl: input.profileImageUrl ?? null,
      dob: input.dob ?? null,
      astroblessCategory: input.astroblessCategory ?? null,
      primarySkill: input.primarySkill ?? null,
      bio: input.bio ?? null,
      languages: input.languages ?? [],
      specialties: input.specialties ?? [],
      experienceYears: input.experienceYears ?? 0,
      pricePerMinChat: input.pricePerMinChat,
      pricePerMinCall: input.pricePerMinCall,
      pricePerMinVideo: input.pricePerMinVideo,
      pricePerMinCallUsd: input.pricePerMinCallUsd ?? null,
      pricePerMinVideoUsd: input.pricePerMinVideoUsd ?? null,
      pricePerReport: input.pricePerReport ?? null,
      pricePerReportUsd: input.pricePerReportUsd ?? null,
      commissionPct: String(input.commissionPct ?? 30),
      onboardingReason: input.onboardingReason ?? null,
      interviewTime: input.interviewTime ?? null,
      currentCity: input.currentCity ?? null,
      otherBusinessSource: input.otherBusinessSource ?? null,
      highestQualification: input.highestQualification ?? null,
      degreeDiploma: input.degreeDiploma ?? null,
      collegeUniversity: input.collegeUniversity ?? null,
      astrologySources: input.astrologySources ?? null,
      instagramUrl: input.instagramUrl ?? null,
      facebookUrl: input.facebookUrl ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      youtubeUrl: input.youtubeUrl ?? null,
      availability: input.availability ?? null,
    })
    .returning();

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.create',
    targetType: 'astrologer',
    targetId: created.id,
    summary: `Admin created astrologer "${input.displayName}"`,
    beforeState: null,
    afterState: created,
    metadata: {},
  });

  return created;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateAstrologer(adminId: string, astrologerId: string, input: UpdateAstrologerInput) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  // Personal
  if (input.displayName !== undefined) updates.displayName = input.displayName;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.email !== undefined) updates.email = input.email;
  if (input.whatsappNumber !== undefined) updates.whatsappNumber = input.whatsappNumber;
  if (input.legalName !== undefined) updates.legalName = input.legalName;
  if (input.registrationCountry !== undefined) updates.registrationCountry = input.registrationCountry;
  if (input.panNumber !== undefined) updates.panNumber = input.panNumber;
  if (input.aadhaarLast4 !== undefined) updates.aadhaarLast4 = input.aadhaarLast4;
  if (input.profileImageUrl !== undefined) updates.profileImageUrl = input.profileImageUrl;
  if (input.upiId !== undefined) updates.upiId = input.upiId;
  // KYC docs: merge patch into existing jsonb
  if (input.kycDocsRef !== undefined) {
    const existing = (before.kycDocsRef ?? {}) as Record<string, unknown>;
    updates.kycDocsRef = { ...existing, ...input.kycDocsRef };
  }
  // Bank: merge patch into existing jsonb
  if (input.bankAccountRef !== undefined) {
    const existing = (before.bankAccountRef ?? {}) as Record<string, unknown>;
    updates.bankAccountRef = { ...existing, ...input.bankAccountRef };
  }
  // Skill
  if (input.dob !== undefined) updates.dob = input.dob;
  if (input.astroblessCategory !== undefined) updates.astroblessCategory = input.astroblessCategory;
  if (input.primarySkill !== undefined) updates.primarySkill = input.primarySkill;
  if (input.bio !== undefined) updates.bio = input.bio;
  if (input.languages !== undefined) updates.languages = input.languages;
  if (input.specialties !== undefined) updates.specialties = input.specialties;
  if (input.experienceYears !== undefined) updates.experienceYears = input.experienceYears;
  if (input.pricePerMinChat !== undefined) updates.pricePerMinChat = input.pricePerMinChat;
  if (input.pricePerMinCall !== undefined) updates.pricePerMinCall = input.pricePerMinCall;
  if (input.pricePerMinVideo !== undefined) updates.pricePerMinVideo = input.pricePerMinVideo;
  if (input.pricePerMinCallUsd !== undefined) updates.pricePerMinCallUsd = input.pricePerMinCallUsd;
  if (input.pricePerMinVideoUsd !== undefined) updates.pricePerMinVideoUsd = input.pricePerMinVideoUsd;
  if (input.pricePerReport !== undefined) updates.pricePerReport = input.pricePerReport;
  if (input.pricePerReportUsd !== undefined) updates.pricePerReportUsd = input.pricePerReportUsd;
  // Other details
  if (input.onboardingReason !== undefined) updates.onboardingReason = input.onboardingReason;
  if (input.interviewTime !== undefined) updates.interviewTime = input.interviewTime;
  if (input.currentCity !== undefined) updates.currentCity = input.currentCity;
  if (input.otherBusinessSource !== undefined) updates.otherBusinessSource = input.otherBusinessSource;
  if (input.highestQualification !== undefined) updates.highestQualification = input.highestQualification;
  if (input.degreeDiploma !== undefined) updates.degreeDiploma = input.degreeDiploma;
  if (input.collegeUniversity !== undefined) updates.collegeUniversity = input.collegeUniversity;
  if (input.astrologySources !== undefined) updates.astrologySources = input.astrologySources;
  // Social links
  if (input.instagramUrl !== undefined) updates.instagramUrl = input.instagramUrl;
  if (input.facebookUrl !== undefined) updates.facebookUrl = input.facebookUrl;
  if (input.linkedinUrl !== undefined) updates.linkedinUrl = input.linkedinUrl;
  if (input.youtubeUrl !== undefined) updates.youtubeUrl = input.youtubeUrl;
  // Availability
  if (input.availability !== undefined) updates.availability = input.availability;

  const [updated] = await db
    .update(astrologers)
    .set(updates as Parameters<typeof db.update>[0])
    .where(eq(astrologers.id, astrologerId))
    .returning();

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.update',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Admin updated astrologer "${before.displayName}".`,
    beforeState: before,
    afterState: updated,
  });

  return updated;
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────

export async function deleteAstrologer(adminId: string, astrologerId: string) {
  const before = await db.query.astrologers.findFirst({ where: eq(astrologers.id, astrologerId) });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  // Soft delete: block + mark as deleted via a convention (isBlocked = true, blockedReason = DELETED).
  // Hard delete is intentionally not exposed through this endpoint.
  await db
    .update(astrologers)
    .set({ isBlocked: true, blockedReason: 'DELETED_BY_ADMIN', isOnline: false, updatedAt: new Date() })
    .where(eq(astrologers.id, astrologerId));

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.delete',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Admin soft-deleted astrologer "${before.displayName}".`,
    beforeState: before,
    afterState: { isBlocked: true, blockedReason: 'DELETED_BY_ADMIN' },
  });
}
