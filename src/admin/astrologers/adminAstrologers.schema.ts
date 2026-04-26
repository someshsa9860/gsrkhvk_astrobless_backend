// Zod schemas for admin astrologer management endpoints.

import { z } from 'zod';
import { ListQuerySchema } from '../shared/listQuery.js';

// ── List astrologers ──────────────────────────────────────────────────────────

export const AstrologerListQuerySchema = ListQuerySchema.extend({
  kycStatus: z.enum(['pending', 'approved', 'rejected']).optional().describe('Filter by KYC status'),
  isOnline: z.coerce.boolean().optional().describe('Filter by current online presence'),
  isBlocked: z.coerce.boolean().optional().describe('Filter by blocked status'),
});

export type AstrologerListQuery = z.infer<typeof AstrologerListQuerySchema>;

// ── KYC decision ──────────────────────────────────────────────────────────────

export const KycDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']).describe('Outcome of the KYC review'),
  note: z.string().optional().describe('Optional note visible to the astrologer'),
});

export type KycDecisionInput = z.infer<typeof KycDecisionSchema>;

// ── Block / Unblock ───────────────────────────────────────────────────────────

export const BlockAstrologerSchema = z.object({
  reason: z.string().optional().describe('Optional reason for blocking (audited)'),
});

export type BlockAstrologerInput = z.infer<typeof BlockAstrologerSchema>;

// ── Commission override ───────────────────────────────────────────────────────

export const CommissionOverrideSchema = z.object({
  commissionPct: z.number().min(0).max(100).describe('New platform commission percentage (0–100)'),
  reason: z.string().min(3).describe('Why the commission is being overridden (audited)'),
});

export type CommissionOverrideInput = z.infer<typeof CommissionOverrideSchema>;

// ── Day slot (availability) ───────────────────────────────────────────────────

const DaySlotSchema = z.object({
  enabled: z.boolean(),
  from: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM'),
});

const AvailabilitySchema = z.object({
  sunday:    DaySlotSchema.optional(),
  monday:    DaySlotSchema.optional(),
  tuesday:   DaySlotSchema.optional(),
  wednesday: DaySlotSchema.optional(),
  thursday:  DaySlotSchema.optional(),
  friday:    DaySlotSchema.optional(),
  saturday:  DaySlotSchema.optional(),
}).optional();

// ── Create astrologer ─────────────────────────────────────────────────────────

export const CreateAstrologerSchema = z
  .object({
    // Personal
    displayName: z.string().min(2).max(100).describe('Astrologer display name'),
    phone: z.string().optional().describe('Phone number (e.g. 919876543210)'),
    email: z.string().email().optional().describe('Email address'),
    whatsappNumber: z.string().optional().describe('WhatsApp number'),
    legalName: z.string().optional().describe('Legal / KYC name'),
    registrationCountry: z.string().optional().describe('Country'),
    panNumber: z.string().optional().describe('PAN card number'),
    profileImageKey: z.string().optional().describe('Profile image storage key'),

    // Skill detail
    dob: z.string().optional().describe('Date of birth (YYYY-MM-DD)'),
    astroblessCategory: z.string().optional().describe('Primary Astrobless category'),
    primarySkill: z.string().optional().describe('Primary skill (e.g. Tarot Card Reader)'),
    bio: z.string().max(1000).optional().describe('Short bio shown on profile'),
    languages: z.array(z.string()).optional().describe('Languages spoken'),
    specialties: z.array(z.string()).optional().describe('Specialty areas'),
    experienceYears: z.number().int().min(0).max(60).optional().describe('Years of experience'),
    pricePerMinChat: z.number().min(0).describe('Chat rate per minute'),
    pricePerMinCall: z.number().min(0).describe('Voice-call rate per minute'),
    pricePerMinVideo: z.number().min(0).describe('Video-call rate per minute'),
    pricePerMinCallUsd: z.number().int().min(0).optional().describe('Voice-call rate — cents per minute'),
    pricePerMinVideoUsd: z.number().int().min(0).optional().describe('Video-call rate — cents per minute'),
    pricePerReport: z.number().int().min(0).optional().describe('Kundli report rate'),
    pricePerReportUsd: z.number().int().min(0).optional().describe('Kundli report rate — cents'),
    commissionPct: z.number().min(0).max(100).optional().describe('Platform commission % (default 30)'),

    // Other details
    onboardingReason: z.string().optional().describe('Why should we onboard you'),
    interviewTime: z.string().optional().describe('Suitable interview time'),
    currentCity: z.string().optional().describe('Current city'),
    otherBusinessSource: z.string().optional().describe('Main source of business other than astrology'),
    highestQualification: z.string().optional().describe('Highest academic qualification'),
    degreeDiploma: z.string().optional().describe('Degree / diploma name'),
    collegeUniversity: z.string().optional().describe('College or university attended'),
    astrologySources: z.string().optional().describe('Where they learned astrology'),

    // Social links
    instagramUrl: z.string().url().optional().nullable().describe('Instagram profile URL'),
    facebookUrl: z.string().url().optional().nullable().describe('Facebook profile URL'),
    linkedinUrl: z.string().url().optional().nullable().describe('LinkedIn profile URL'),
    youtubeUrl: z.string().url().optional().nullable().describe('YouTube channel URL'),

    // Availability
    availability: AvailabilitySchema,
  })
  .refine((d) => d.phone || d.email, { message: 'Either phone or email is required.' });

export type CreateAstrologerInput = z.infer<typeof CreateAstrologerSchema>;

// ── Update astrologer ─────────────────────────────────────────────────────────

export const UpdateAstrologerSchema = z.object({
  // Personal
  displayName: z.string().min(2).max(100).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  legalName: z.string().optional().nullable(),
  registrationCountry: z.string().optional().nullable(),
  panNumber: z.string().optional().nullable(),
  aadhaarLast4: z.string().length(4).optional().nullable(),
  profileImageKey: z.string().optional().nullable(),

  // KYC docs (JSONB patch — merged server-side)
  kycDocsRef: z.object({
    aadhaarDocKey: z.string().optional(),
    aadhaarBackDocKey: z.string().optional(),
    panDocKey: z.string().optional(),
    selfieDocKey: z.string().optional(),
    certificationDocKey: z.string().optional(),
    submittedAt: z.string().optional(),
    reviewNote: z.string().optional(),
  }).optional(),

  // Bank details (JSONB patch — merged server-side)
  bankAccountRef: z.object({
    accountHolderName: z.string().optional(),
    accountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    bankName: z.string().optional(),
    accountType: z.enum(['savings', 'current']).optional(),
    branchName: z.string().optional(),
  }).optional(),

  upiId: z.string().optional().nullable(),

  // Skill detail
  dob: z.string().optional().nullable(),
  astroblessCategory: z.string().optional().nullable(),
  primarySkill: z.string().optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  languages: z.array(z.string()).optional(),
  specialties: z.array(z.string()).optional(),
  experienceYears: z.number().int().min(0).max(60).optional(),
  pricePerMinChat: z.number().min(0).optional(),
  pricePerMinCall: z.number().min(0).optional(),
  pricePerMinVideo: z.number().min(0).optional(),
  pricePerMinCallUsd: z.number().int().min(0).optional().nullable(),
  pricePerMinVideoUsd: z.number().int().min(0).optional().nullable(),
  pricePerReport: z.number().int().min(0).optional().nullable(),
  pricePerReportUsd: z.number().int().min(0).optional().nullable(),

  // Other details
  onboardingReason: z.string().optional().nullable(),
  interviewTime: z.string().optional().nullable(),
  currentCity: z.string().optional().nullable(),
  otherBusinessSource: z.string().optional().nullable(),
  highestQualification: z.string().optional().nullable(),
  degreeDiploma: z.string().optional().nullable(),
  collegeUniversity: z.string().optional().nullable(),
  astrologySources: z.string().optional().nullable(),

  // Social links
  instagramUrl: z.string().url().optional().nullable(),
  facebookUrl: z.string().url().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  youtubeUrl: z.string().url().optional().nullable(),

  // Availability
  availability: AvailabilitySchema,
});

export type UpdateAstrologerInput = z.infer<typeof UpdateAstrologerSchema>;
