import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import { paginationFrom, toPagedResult } from '../shared/listQuery.js';
import { sendTransactionalEmail } from '../../lib/email.js';
import { sendPush } from '../../modules/notifications/notifications.service.js';
import type {
  AstrologerListQuery,
  KycDecisionInput,
  BlockAstrologerInput,
  CommissionOverrideInput,
  CreateAstrologerInput,
  UpdateAstrologerInput,
} from './adminAstrologers.schema.js';

// ── List ──────────────────────────────────────────────────────────────────────

export async function listAstrologers(q: AstrologerListQuery) {
  const { offset, limit } = paginationFrom(q);
  const where: Record<string, unknown> = {};
  if (q.search) where['displayName'] = { contains: q.search, mode: 'insensitive' };
  if (q.kycStatus) where['kycStatus'] = q.kycStatus;
  if (q.isOnline !== undefined) where['isOnline'] = q.isOnline;
  if (q.isBlocked !== undefined) where['isBlocked'] = q.isBlocked;

  const [items, total] = await prisma.$transaction([
    prisma.astrologer.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.astrologer.count({ where }),
  ]);

  return toPagedResult(items, total, q);
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getAstrologer(id: string) {
  const astrologer = await prisma.astrologer.findFirst({ where: { id } });
  if (!astrologer) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);
  return astrologer;
}

// ── KYC decision ──────────────────────────────────────────────────────────────

export async function decideKyc(adminId: string, astrologerId: string, input: KycDecisionInput) {
  const before = await prisma.astrologer.findFirst({ where: { id: astrologerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  const isApproved = input.decision === 'approved';
  await prisma.astrologer.update({
    where: { id: astrologerId },
    data: { kycStatus: input.decision, isVerified: isApproved, updatedAt: new Date() },
  });

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

  // Email + FCM — fire-and-forget
  if (before.email) {
    const subject = isApproved ? 'Your KYC has been approved — Welcome to Astrobless!' : 'KYC verification update';
    const htmlBody = isApproved
      ? `<p>Hi ${before.displayName ?? 'Astrologer'},</p><p>Congratulations! Your KYC has been <strong>approved</strong>. You can now go online and start accepting consultations on Astrobless.</p><p>Thank you,<br/>Astrobless Team</p>`
      : `<p>Hi ${before.displayName ?? 'Astrologer'},</p><p>Your KYC verification was <strong>not approved</strong>. ${input.note ? `Reason: ${input.note}` : 'Please contact support for more details.'}</p><p>Thank you,<br/>Astrobless Team</p>`;
    void sendTransactionalEmail({ to: before.email, toName: before.displayName ?? undefined, subject, htmlBody }).catch(() => {});
  }

  const fcmTitle = isApproved ? 'KYC Approved 🎉' : 'KYC Update';
  const fcmBody = isApproved
    ? 'Your verification is complete. Go online and start earning!'
    : `Your KYC was not approved. ${input.note ?? 'Contact support for details.'}`;
  void sendPush('astrologer', astrologerId, fcmTitle, fcmBody, { type: 'kycStatusUpdate', kycStatus: input.decision }).catch(() => {});
}

// ── Block / Unblock ───────────────────────────────────────────────────────────

export async function blockAstrologer(adminId: string, astrologerId: string, input: BlockAstrologerInput) {
  const before = await prisma.astrologer.findFirst({ where: { id: astrologerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await prisma.astrologer.update({
    where: { id: astrologerId },
    data: { isBlocked: true, blockedReason: input.reason, isOnline: false, updatedAt: new Date() },
  });

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

  // Email + FCM — fire-and-forget
  if (before.email) {
    void sendTransactionalEmail({
      to: before.email,
      toName: before.displayName ?? undefined,
      subject: 'Your Astrobless account has been suspended',
      htmlBody: `<p>Hi ${before.displayName ?? 'Astrologer'},</p><p>Your account has been <strong>suspended</strong>. ${input.reason ? `Reason: ${input.reason}` : ''}</p><p>Please contact support if you believe this is an error.</p><p>Astrobless Team</p>`,
    }).catch(() => {});
  }
  void sendPush('astrologer', astrologerId, 'Account Suspended', `Your account has been suspended. ${input.reason ?? ''}`.trim(), { type: 'accountBlocked' }).catch(() => {});
}

export async function unblockAstrologer(adminId: string, astrologerId: string) {
  const before = await prisma.astrologer.findFirst({ where: { id: astrologerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await prisma.astrologer.update({
    where: { id: astrologerId },
    data: { isBlocked: false, blockedReason: null, updatedAt: new Date() },
  });

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

  // Email + FCM — fire-and-forget
  if (before.email) {
    void sendTransactionalEmail({
      to: before.email,
      toName: before.displayName ?? undefined,
      subject: 'Your Astrobless account has been reinstated',
      htmlBody: `<p>Hi ${before.displayName ?? 'Astrologer'},</p><p>Good news! Your account has been <strong>reinstated</strong>. You can log in and start accepting consultations again.</p><p>Astrobless Team</p>`,
    }).catch(() => {});
  }
  void sendPush('astrologer', astrologerId, 'Account Reinstated', 'Your account is active again. Go online and start accepting consultations!', { type: 'accountUnblocked' }).catch(() => {});
}

// ── Commission override ───────────────────────────────────────────────────────

export async function overrideCommission(adminId: string, astrologerId: string, input: CommissionOverrideInput) {
  const before = await prisma.astrologer.findFirst({ where: { id: astrologerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await prisma.astrologer.update({
    where: { id: astrologerId },
    data: { commissionPct: String(input.commissionPct), updatedAt: new Date() },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.commissionOverride',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Commission changed to ${input.commissionPct}%. Reason: ${input.reason}`,
    beforeState: { commissionPct: String(before.commissionPct) },
    afterState: { commissionPct: input.commissionPct },
    metadata: { reason: input.reason },
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAstrologer(adminId: string, input: CreateAstrologerInput) {
  if (input.phone) {
    const phoneExists = await prisma.astrologer.findUnique({ where: { phone: input.phone }, select: { id: true } });
    if (phoneExists) throw new AppError('CONFLICT', `Phone number ${input.phone} is already registered to another astrologer.`, 409);
  }
  if (input.email) {
    const emailExists = await prisma.astrologer.findUnique({ where: { email: input.email }, select: { id: true } });
    if (emailExists) throw new AppError('CONFLICT', `Email ${input.email} is already registered to another astrologer.`, 409);
  }

  const created = await prisma.astrologer.create({
    data: {
      displayName: input.displayName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      whatsappNumber: input.whatsappNumber ?? null,
      legalName: input.legalName ?? null,
      registrationCountry: input.registrationCountry ?? null,
      panNumber: input.panNumber ?? null,
      profileImageKey: input.profileImageKey ?? null,
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
      commissionPct: input.commissionPct ? String(input.commissionPct) : '30.00',
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
      availability: input.availability ?? undefined,
    },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.create',
    targetType: 'astrologer',
    targetId: created.id,
    summary: `Admin created astrologer "${created.displayName}"`,
    beforeState: null,
    afterState: created as unknown as Record<string, unknown>,
  });

  return created;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateAstrologer(adminId: string, astrologerId: string, input: UpdateAstrologerInput) {
  const before = await prisma.astrologer.findFirst({ where: { id: astrologerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  if (input.phone !== undefined && input.phone !== before.phone) {
    const phoneExists = await prisma.astrologer.findUnique({ where: { phone: input.phone }, select: { id: true } });
    if (phoneExists) throw new AppError('CONFLICT', `Phone number ${input.phone} is already registered to another astrologer.`, 409);
  }
  if (input.email !== undefined && input.email !== before.email) {
    const emailExists = await prisma.astrologer.findUnique({ where: { email: input.email }, select: { id: true } });
    if (emailExists) throw new AppError('CONFLICT', `Email ${input.email} is already registered to another astrologer.`, 409);
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) data['displayName'] = input.displayName;
  if (input.phone !== undefined) data['phone'] = input.phone;
  if (input.email !== undefined) data['email'] = input.email;
  if (input.whatsappNumber !== undefined) data['whatsappNumber'] = input.whatsappNumber;
  if (input.legalName !== undefined) data['legalName'] = input.legalName;
  if (input.registrationCountry !== undefined) data['registrationCountry'] = input.registrationCountry;
  if (input.panNumber !== undefined) data['panNumber'] = input.panNumber;
  if (input.aadhaarLast4 !== undefined) data['aadhaarLast4'] = input.aadhaarLast4;
  if (input.profileImageKey !== undefined) data['profileImageKey'] = input.profileImageKey;
  if (input.upiId !== undefined) data['upiId'] = input.upiId;
  if (input.kycDocsRef !== undefined) {
    const existing = (before.kycDocsRef ?? {}) as Record<string, unknown>;
    data['kycDocsRef'] = { ...existing, ...input.kycDocsRef };
  }
  if (input.bankAccountRef !== undefined) {
    const existing = (before.bankAccountRef ?? {}) as Record<string, unknown>;
    data['bankAccountRef'] = { ...existing, ...input.bankAccountRef };
  }
  if (input.dob !== undefined) data['dob'] = input.dob;
  if (input.astroblessCategory !== undefined) data['astroblessCategory'] = input.astroblessCategory;
  if (input.primarySkill !== undefined) data['primarySkill'] = input.primarySkill;
  if (input.bio !== undefined) data['bio'] = input.bio;
  if (input.languages !== undefined) data['languages'] = input.languages;
  if (input.specialties !== undefined) data['specialties'] = input.specialties;
  if (input.experienceYears !== undefined) data['experienceYears'] = input.experienceYears;
  if (input.pricePerMinChat !== undefined) data['pricePerMinChat'] = input.pricePerMinChat;
  if (input.pricePerMinCall !== undefined) data['pricePerMinCall'] = input.pricePerMinCall;
  if (input.pricePerMinVideo !== undefined) data['pricePerMinVideo'] = input.pricePerMinVideo;
  if (input.pricePerMinCallUsd !== undefined) data['pricePerMinCallUsd'] = input.pricePerMinCallUsd;
  if (input.pricePerMinVideoUsd !== undefined) data['pricePerMinVideoUsd'] = input.pricePerMinVideoUsd;
  if (input.pricePerReport !== undefined) data['pricePerReport'] = input.pricePerReport;
  if (input.pricePerReportUsd !== undefined) data['pricePerReportUsd'] = input.pricePerReportUsd;
  if (input.onboardingReason !== undefined) data['onboardingReason'] = input.onboardingReason;
  if (input.interviewTime !== undefined) data['interviewTime'] = input.interviewTime;
  if (input.currentCity !== undefined) data['currentCity'] = input.currentCity;
  if (input.otherBusinessSource !== undefined) data['otherBusinessSource'] = input.otherBusinessSource;
  if (input.highestQualification !== undefined) data['highestQualification'] = input.highestQualification;
  if (input.degreeDiploma !== undefined) data['degreeDiploma'] = input.degreeDiploma;
  if (input.collegeUniversity !== undefined) data['collegeUniversity'] = input.collegeUniversity;
  if (input.astrologySources !== undefined) data['astrologySources'] = input.astrologySources;
  if (input.instagramUrl !== undefined) data['instagramUrl'] = input.instagramUrl;
  if (input.facebookUrl !== undefined) data['facebookUrl'] = input.facebookUrl;
  if (input.linkedinUrl !== undefined) data['linkedinUrl'] = input.linkedinUrl;
  if (input.youtubeUrl !== undefined) data['youtubeUrl'] = input.youtubeUrl;
  if (input.availability !== undefined) data['availability'] = input.availability;

  const updated = await prisma.astrologer.update({ where: { id: astrologerId }, data });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.update',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Admin updated astrologer "${before.displayName}".`,
    beforeState: before as unknown as Record<string, unknown>,
    afterState: updated as unknown as Record<string, unknown>,
  });

  return updated;
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────

export async function deleteAstrologer(adminId: string, astrologerId: string) {
  const before = await prisma.astrologer.findFirst({ where: { id: astrologerId } });
  if (!before) throw new AppError('NOT_FOUND', 'Astrologer not found.', 404);

  await prisma.astrologer.update({
    where: { id: astrologerId },
    data: { isBlocked: true, blockedReason: 'DELETED_BY_ADMIN', isOnline: false, updatedAt: new Date() },
  });

  await writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'astrologer.delete',
    targetType: 'astrologer',
    targetId: astrologerId,
    summary: `Admin soft-deleted astrologer "${before.displayName}".`,
    beforeState: before as unknown as Record<string, unknown>,
    afterState: { isBlocked: true, blockedReason: 'DELETED_BY_ADMIN' },
  });
}
