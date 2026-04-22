// RBAC: permission enum, role→permission map, and preHandler factories.
// requirePermission is always used ALONGSIDE requireAudience — it never replaces it.

import type { preHandlerHookHandler } from 'fastify';
import { db } from '../../db/client.js';
import { admins } from '../../db/schema/admins.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';

// ── Permission enum ───────────────────────────────────────────────────────────

export enum AdminPermission {
  DASHBOARD_VIEW = 'dashboard.view',
  ASTROLOGER_VIEW = 'astrologer.view',
  ASTROLOGER_KYC_REVIEW = 'astrologer.kycReview',
  ASTROLOGER_BLOCK = 'astrologer.block',
  ASTROLOGER_EDIT = 'astrologer.edit',
  CUSTOMER_VIEW = 'customer.view',
  CUSTOMER_BLOCK = 'customer.block',
  CUSTOMER_WALLET_ADJUST = 'customer.walletAdjust',
  CUSTOMER_REFUND = 'customer.refund',
  CONSULTATION_VIEW = 'consultation.view',
  CONSULTATION_TRANSCRIPT_VIEW = 'consultation.transcriptView',
  CONSULTATION_REFUND = 'consultation.refund',
  PAYMENT_VIEW = 'payment.view',
  PAYOUT_VIEW = 'payout.view',
  PAYOUT_APPROVE = 'payout.approve',
  ASTROLOGER_RECHARGE = 'astrologer.recharge',
  HOROSCOPE_MANAGE = 'horoscope.manage',
  ARTICLE_MANAGE = 'article.manage',
  BANNER_MANAGE = 'banner.manage',
  PUSH_CAMPAIGN_MANAGE = 'pushCampaign.manage',
  PRODUCT_MANAGE = 'product.manage',
  ORDER_VIEW = 'order.view',
  ORDER_MANAGE = 'order.manage',
  SUPPORT_TICKET_VIEW = 'support.ticketView',
  SUPPORT_TICKET_RESPOND = 'support.ticketRespond',
  FEEDBACK_VIEW = 'feedback.view',
  SETTINGS_VIEW = 'settings.view',
  SETTINGS_EDIT = 'settings.edit',
  LOG_VIEW = 'log.view',
  AUDIT_VIEW = 'audit.view',
  ERROR_VIEW = 'error.view',
  ERROR_RESOLVE = 'error.resolve',
  ADMIN_MANAGE = 'admin.manage',
  EXPORT_REQUEST = 'export.request',
}

export type AdminRole = 'superAdmin' | 'ops' | 'finance' | 'support' | 'content' | 'analyst';

export const ADMIN_ROLES: AdminRole[] = ['superAdmin', 'ops', 'finance', 'support', 'content', 'analyst'];

const ALL_PERMISSIONS = Object.values(AdminPermission);

// Map each role to its granted permissions.
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  superAdmin: ALL_PERMISSIONS,
  ops: [
    AdminPermission.DASHBOARD_VIEW,
    AdminPermission.ASTROLOGER_VIEW, AdminPermission.ASTROLOGER_KYC_REVIEW,
    AdminPermission.ASTROLOGER_BLOCK, AdminPermission.ASTROLOGER_EDIT,
    AdminPermission.CUSTOMER_VIEW, AdminPermission.CUSTOMER_BLOCK,
    AdminPermission.CONSULTATION_VIEW, AdminPermission.CONSULTATION_TRANSCRIPT_VIEW,
    AdminPermission.PAYMENT_VIEW, AdminPermission.PAYOUT_VIEW, AdminPermission.PAYOUT_APPROVE,
    AdminPermission.SUPPORT_TICKET_VIEW, AdminPermission.SUPPORT_TICKET_RESPOND,
    AdminPermission.SETTINGS_VIEW, AdminPermission.SETTINGS_EDIT,
    AdminPermission.LOG_VIEW, AdminPermission.AUDIT_VIEW,
    AdminPermission.ERROR_VIEW, AdminPermission.ERROR_RESOLVE,
    AdminPermission.EXPORT_REQUEST,
  ],
  finance: [
    AdminPermission.DASHBOARD_VIEW,
    AdminPermission.PAYMENT_VIEW, AdminPermission.PAYOUT_VIEW, AdminPermission.PAYOUT_APPROVE,
    AdminPermission.CUSTOMER_VIEW, AdminPermission.CUSTOMER_WALLET_ADJUST, AdminPermission.CUSTOMER_REFUND,
    AdminPermission.CONSULTATION_VIEW, AdminPermission.CONSULTATION_REFUND,
    AdminPermission.ASTROLOGER_RECHARGE,
    AdminPermission.SETTINGS_VIEW, AdminPermission.AUDIT_VIEW,
    AdminPermission.EXPORT_REQUEST,
  ],
  support: [
    AdminPermission.DASHBOARD_VIEW,
    AdminPermission.CUSTOMER_VIEW, AdminPermission.CUSTOMER_BLOCK,
    AdminPermission.CONSULTATION_VIEW, AdminPermission.CONSULTATION_TRANSCRIPT_VIEW,
    AdminPermission.SUPPORT_TICKET_VIEW, AdminPermission.SUPPORT_TICKET_RESPOND,
    AdminPermission.FEEDBACK_VIEW, AdminPermission.ORDER_VIEW,
    AdminPermission.EXPORT_REQUEST,
  ],
  content: [
    AdminPermission.DASHBOARD_VIEW,
    AdminPermission.HOROSCOPE_MANAGE, AdminPermission.ARTICLE_MANAGE,
    AdminPermission.BANNER_MANAGE, AdminPermission.PUSH_CAMPAIGN_MANAGE,
    AdminPermission.PRODUCT_MANAGE, AdminPermission.ORDER_MANAGE,
    AdminPermission.ASTROLOGER_VIEW, AdminPermission.SETTINGS_VIEW,
    AdminPermission.EXPORT_REQUEST,
  ],
  analyst: [
    AdminPermission.DASHBOARD_VIEW,
    AdminPermission.ASTROLOGER_VIEW, AdminPermission.CUSTOMER_VIEW,
    AdminPermission.CONSULTATION_VIEW, AdminPermission.PAYMENT_VIEW, AdminPermission.PAYOUT_VIEW,
    AdminPermission.ORDER_VIEW, AdminPermission.SUPPORT_TICKET_VIEW, AdminPermission.FEEDBACK_VIEW,
    AdminPermission.LOG_VIEW, AdminPermission.AUDIT_VIEW, AdminPermission.ERROR_VIEW,
    AdminPermission.EXPORT_REQUEST,
  ],
};

// ── Internal helper: load admin + resolve effective permissions ───────────────

async function resolveAdminPermissions(adminId: string): Promise<{ role: AdminRole; effectivePerms: Set<string> }> {
  const admin = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!admin || !admin.isActive) {
    throw new AppError('FORBIDDEN', 'Admin account not found or inactive.', 403);
  }
  const role = admin.role as AdminRole;
  const base = ROLE_PERMISSIONS[role] ?? [];
  const custom = (admin.customPermissions ?? []) as string[];
  const effectivePerms = new Set<string>([...base, ...custom]);
  return { role, effectivePerms };
}

// ── requirePermission: checks ALL listed permissions are present ──────────────

export function requirePermission(...perms: AdminPermission[]): preHandlerHookHandler {
  return async (req) => {
    const adminId = req.requestContext?.actorId;
    if (!adminId) throw new AppError('AUTH_REQUIRED', 'No actor in request context.', 401);

    const { effectivePerms } = await resolveAdminPermissions(adminId);
    const missing = perms.filter((p) => !effectivePerms.has(p));

    if (missing.length > 0) {
      // Audit every denial so we have a trail of probing attempts.
      await writeAuditLog({
        actorType: 'admin',
        actorId: adminId,
        action: 'admin.permissionDenied',
        summary: `Permission denied. Required: ${perms.join(', ')}. Missing: ${missing.join(', ')}`,
        metadata: { requiredPerms: perms, missingPerms: missing, path: req.url },
      });
      throw new AppError('FORBIDDEN', `Permission denied. Missing: ${missing.join(', ')}`, 403);
    }
  };
}

// ── requireRole: lighter check — only verifies role membership ────────────────

export function requireRole(...roles: AdminRole[]): preHandlerHookHandler {
  return async (req) => {
    const adminId = req.requestContext?.actorId;
    if (!adminId) throw new AppError('AUTH_REQUIRED', 'No actor in request context.', 401);

    const { role } = await resolveAdminPermissions(adminId);
    if (!roles.includes(role)) {
      throw new AppError('FORBIDDEN', `Role '${role}' is not allowed here. Required: ${roles.join(', ')}`, 403);
    }
  };
}
