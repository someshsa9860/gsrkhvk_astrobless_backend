/**
 * Central registry of all API route path strings.
 *
 * Route modules import from here instead of hard-coding paths inline.
 * This makes refactoring, contract testing, and client SDK generation
 * easier — every path lives in exactly one place.
 *
 * Convention:
 *   - Namespace constants by persona: CUSTOMER_ROUTES, ASTROLOGER_ROUTES,
 *     ADMIN_ROUTES, PUBLIC_ROUTES, WEBHOOK_ROUTES.
 *   - Dynamic segments use a function that accepts the param value, e.g.
 *     `detail: (id: string) => \`/v1/customer/consultations/${id}\``.
 *   - Static segments are plain `string` properties.
 *   - All values are `as const` so TypeScript can narrow to the literal type.
 */

// ─── Customer (/v1/customer/*) ────────────────────────────────────────────────

export const CUSTOMER_ROUTES = {
  auth: {
    /** POST – Send phone OTP via SMS (MSG91). Rate-limited 5/hr per phone. */
    sendPhoneOtp: '/v1/customer/auth/phone/send-otp',
    /** POST – Verify phone OTP and issue JWT pair. */
    verifyPhoneOtp: '/v1/customer/auth/phone/verify-otp',
    /** POST – Begin email sign-up; triggers email OTP. */
    emailSignup: '/v1/customer/auth/email/signup',
    /** POST – Verify email OTP and activate account. */
    verifyEmailOtp: '/v1/customer/auth/email/verify-otp',
    /** POST – Resend email verification OTP. Rate-limited 3/hr/email. */
    resendEmailOtp: '/v1/customer/auth/email/resend-otp',
    /** POST – Log in with email + password. */
    emailLogin: '/v1/customer/auth/email/login',
    /** POST – Request a password reset link. */
    forgotPassword: '/v1/customer/auth/email/forgot-password',
    /** POST – Complete password reset with token. */
    resetPassword: '/v1/customer/auth/email/reset-password',
    /** POST – Sign in via Google ID token. */
    google: '/v1/customer/auth/google',
    /** POST – Sign in via Apple identity token (iOS). */
    apple: '/v1/customer/auth/apple',
    /** POST – Rotate refresh token. */
    refresh: '/v1/customer/auth/refresh',
    /** DELETE – Revoke current session. */
    logout: '/v1/customer/auth/logout',
  },
  profile: {
    /** GET – Current customer profile. */
    me: '/v1/customer/me',
    /** PATCH – Update customer profile fields. */
    update: '/v1/customer/me',
  },
  astrologers: {
    /** GET – Paginated astrologer list (search, filter, sort). */
    list: '/v1/customer/astrologers',
    /** GET – Single astrologer profile. */
    detail: (id: string) => `/v1/customer/astrologers/${id}`,
    /** GET – Paginated reviews for an astrologer. */
    reviews: (id: string) => `/v1/customer/astrologers/${id}/reviews`,
  },
  consultations: {
    /** POST – Request a new consultation. */
    request: '/v1/customer/consultations/request',
    /** GET – Paginated consultation history. */
    list: '/v1/customer/consultations',
    /** GET – Single consultation detail. */
    detail: (id: string) => `/v1/customer/consultations/${id}`,
    /** GET – Paginated chat messages for a consultation. */
    messages: (id: string) => `/v1/customer/consultations/${id}/messages`,
    /** POST – End an active consultation. */
    end: (id: string) => `/v1/customer/consultations/${id}/end`,
  },
  wallet: {
    /** GET – Current wallet balance. */
    balance: '/v1/customer/wallet',
    /** GET – Paginated wallet transaction ledger. */
    transactions: '/v1/customer/wallet/transactions',
    /** POST – Initiate a wallet top-up via a payment provider. */
    topup: '/v1/customer/wallet/topup',
    /** GET – Available payment providers for the current region/platform. */
    providers: '/v1/customer/wallet/providers',
  },
  kundli: {
    /** GET – List saved Kundli profiles. */
    profiles: '/v1/customer/kundli/profiles',
    /** POST – Create a Kundli profile from birth details. */
    createProfile: '/v1/customer/kundli/profiles',
    /** GET – Single Kundli profile. */
    profileDetail: (id: string) => `/v1/customer/kundli/profiles/${id}`,
    /** DELETE – Delete a Kundli profile. */
    deleteProfile: (id: string) => `/v1/customer/kundli/profiles/${id}`,
    /** GET – Fetch (or generate) the Kundli report for a profile. Cached in DB. */
    report: (id: string) => `/v1/customer/kundli/profiles/${id}/report`,
  },
  ai: {
    /** POST – Stream AI astrologer chat response (SSE / chunked). */
    chatStream: '/v1/customer/ai/chat/stream',
  },
  notifications: {
    /** GET – Paginated in-app notifications. */
    list: '/v1/customer/notifications',
    /** PATCH – Mark a single notification read. */
    markRead: (id: string) => `/v1/customer/notifications/${id}/read`,
    /** POST – Mark all notifications read. */
    markAllRead: '/v1/customer/notifications/read-all',
    /** POST – Register / refresh an FCM device token. */
    registerFcmToken: '/v1/customer/notifications/fcm-token',
  },
  uploads: {
    /** POST – Upload an image (multipart/form-data). */
    image: '/v1/customer/upload/image',
  },
} as const;

// ─── Astrologer (/v1/astrologer/*) ───────────────────────────────────────────

export const ASTROLOGER_ROUTES = {
  auth: {
    /** POST – Send phone OTP. Rate-limited 5/hr per phone. */
    sendPhoneOtp: '/v1/astrologer/auth/phone/send-otp',
    /** POST – Verify phone OTP and issue JWT pair. */
    verifyPhoneOtp: '/v1/astrologer/auth/phone/verify-otp',
    /** POST – Begin email sign-up; triggers email OTP. */
    emailSignup: '/v1/astrologer/auth/email/signup',
    /** POST – Verify email OTP. */
    verifyEmailOtp: '/v1/astrologer/auth/email/verify-otp',
    /** POST – Resend email OTP. */
    resendEmailOtp: '/v1/astrologer/auth/email/resend-otp',
    /** POST – Log in with email + password. */
    emailLogin: '/v1/astrologer/auth/email/login',
    /** POST – Request password reset. */
    forgotPassword: '/v1/astrologer/auth/email/forgot-password',
    /** POST – Complete password reset. */
    resetPassword: '/v1/astrologer/auth/email/reset-password',
    /** POST – Rotate refresh token. */
    refresh: '/v1/astrologer/auth/refresh',
    /** DELETE – Revoke session. */
    logout: '/v1/astrologer/auth/logout',
  },
  profile: {
    /** GET – Authenticated astrologer's profile. */
    me: '/v1/astrologer/profile',
    /** PATCH – Update profile fields. */
    update: '/v1/astrologer/profile',
    /** PATCH – Toggle online/offline presence. */
    presence: '/v1/astrologer/profile/presence',
    /** PATCH – Update per-minute pricing. */
    pricing: '/v1/astrologer/profile/pricing',
  },
  consultations: {
    /** GET – Paginated consultation list. */
    list: '/v1/astrologer/consultations',
    /** GET – Single consultation detail. */
    detail: (id: string) => `/v1/astrologer/consultations/${id}`,
    /** GET – Paginated chat messages. */
    messages: (id: string) => `/v1/astrologer/consultations/${id}/messages`,
    /** POST – Accept an incoming request. */
    accept: (id: string) => `/v1/astrologer/consultations/${id}/accept`,
    /** POST – Reject an incoming request. */
    reject: (id: string) => `/v1/astrologer/consultations/${id}/reject`,
    /** POST – End an active consultation. */
    end: (id: string) => `/v1/astrologer/consultations/${id}/end`,
  },
  earnings: {
    /** GET – Aggregated earnings summary. */
    summary: '/v1/astrologer/earnings/summary',
    /** GET – Paginated earning transactions. */
    list: '/v1/astrologer/earnings',
    /** GET – Payout history. */
    payouts: '/v1/astrologer/payouts',
  },
  kundli: {
    /** GET – Paginated kundli requests. */
    list: '/v1/astrologer/kundli-requests',
    /** GET – Single kundli request. */
    detail: (id: string) => `/v1/astrologer/kundli-requests/${id}`,
    /** POST – Accept a kundli request. */
    accept: (id: string) => `/v1/astrologer/kundli-requests/${id}/accept`,
    /** POST – Decline a kundli request. */
    decline: (id: string) => `/v1/astrologer/kundli-requests/${id}/decline`,
    /** POST – Submit the completed kundli report. */
    submit: (id: string) => `/v1/astrologer/kundli-requests/${id}/submit`,
  },
  notifications: {
    /** GET – In-app notifications. */
    list: '/v1/astrologer/notifications',
    /** PATCH – Mark single notification read. */
    markRead: (id: string) => `/v1/astrologer/notifications/${id}/read`,
    /** POST – Mark all notifications read. */
    markAllRead: '/v1/astrologer/notifications/read-all',
    /** POST – Register FCM token. */
    registerFcmToken: '/v1/astrologer/notifications/fcm-token',
  },
  uploads: {
    /** POST – Upload an image (profiles | kyc). */
    image: '/v1/astrologer/upload/image',
  },
} as const;

// ─── Admin (/v1/admin/*) ──────────────────────────────────────────────────────

export const ADMIN_ROUTES = {
  auth: {
    /** POST – Verify Google ID token; returns tempToken. */
    google: '/v1/admin/auth/google',
    /** POST – Send email OTP. */
    sendEmailOtp: '/v1/admin/auth/email/send-otp',
    /** POST – Verify email OTP; returns tempToken. */
    verifyEmailOtp: '/v1/admin/auth/email/verify-otp',
    /** POST – Verify TOTP and issue full session. */
    totp: '/v1/admin/auth/totp',
    /** POST – Begin TOTP enrollment; returns QR + secret. */
    totpEnroll: '/v1/admin/auth/totp/enroll',
    /** POST – Confirm TOTP enrollment. */
    totpConfirm: '/v1/admin/auth/totp/confirm',
    /** POST – Rotate admin refresh token. */
    refresh: '/v1/admin/auth/refresh',
    /** POST – Revoke admin session. */
    logout: '/v1/admin/auth/logout',
  },
  dashboard: {
    /** GET – Live KPI overview (cached 60s). */
    overview: '/v1/admin/dashboard/overview',
    /** GET – Time-series metric data. */
    timeseries: '/v1/admin/dashboard/timeseries',
    /** GET – Top-N ranked lists. */
    topLists: '/v1/admin/dashboard/top-lists',
  },
  customers: {
    /** GET – Paginated customer list. */
    list: '/v1/admin/customers',
    /** GET – Single customer detail. */
    detail: (id: string) => `/v1/admin/customers/${id}`,
    /** POST – Block a customer. */
    block: (id: string) => `/v1/admin/customers/${id}/block`,
    /** POST – Unblock a customer. */
    unblock: (id: string) => `/v1/admin/customers/${id}/unblock`,
    /** POST – Credit customer wallet. */
    walletCredit: (id: string) => `/v1/admin/customers/${id}/wallet/credit`,
    /** POST – Force-logout all sessions. */
    forceLogout: (id: string) => `/v1/admin/customers/${id}/force-logout`,
  },
  astrologers: {
    /** GET – Paginated astrologer list. */
    list: '/v1/admin/astrologers',
    /** GET – Single astrologer detail. */
    detail: (id: string) => `/v1/admin/astrologers/${id}`,
    /** POST – Decide KYC (approve / reject). */
    kycDecide: (id: string) => `/v1/admin/astrologers/${id}/kyc/decide`,
    /** POST – Block an astrologer. */
    block: (id: string) => `/v1/admin/astrologers/${id}/block`,
    /** POST – Unblock an astrologer. */
    unblock: (id: string) => `/v1/admin/astrologers/${id}/unblock`,
    /** POST – Override commission percentage. */
    commission: (id: string) => `/v1/admin/astrologers/${id}/commission`,
    /** GET – Astrologer consultations. */
    consultations: (id: string) => `/v1/admin/astrologers/${id}/consultations`,
    /** GET – Astrologer earnings breakdown. */
    earnings: (id: string) => `/v1/admin/astrologers/${id}/earnings`,
    /** GET – Astrologer reviews. */
    reviews: (id: string) => `/v1/admin/astrologers/${id}/reviews`,
  },
  consultations: {
    /** GET – Paginated consultation list. */
    list: '/v1/admin/consultations',
    /** GET – Single consultation detail. */
    detail: (id: string) => `/v1/admin/consultations/${id}`,
    /** GET – Chat transcript for a consultation. */
    messages: (id: string) => `/v1/admin/consultations/${id}/messages`,
    /** POST – Force-end a stuck consultation. */
    end: (id: string) => `/v1/admin/consultations/${id}/end`,
  },
  finance: {
    /** GET – Paginated wallet transactions. */
    transactions: '/v1/admin/finance/transactions',
    /** GET – Paginated payout list. */
    payouts: '/v1/admin/finance/payouts',
    /** POST – Approve a payout. */
    approvePayout: (id: string) => `/v1/admin/finance/payouts/${id}/approve`,
  },
  observability: {
    /** GET – Paginated system errors (grouped by fingerprint). */
    errors: '/v1/admin/observability/errors',
    /** GET – Error occurrence stats. */
    errorStats: '/v1/admin/observability/errors/stats',
    /** GET – Single error detail. */
    errorDetail: (id: string) => `/v1/admin/observability/errors/${id}`,
    /** POST – Resolve an error. */
    resolveError: (id: string) =>
      `/v1/admin/observability/errors/${id}/resolve`,
    /** POST – Reopen a resolved error. */
    reopenError: (id: string) =>
      `/v1/admin/observability/errors/${id}/reopen`,
    /** GET – Paginated audit trail. */
    audit: '/v1/admin/observability/audit',
    /** GET – Paginated API log entries. */
    apiLogs: '/v1/admin/observability/api-logs',
    /** GET – Consolidated trace waterfall by traceId. */
    trace: (traceId: string) =>
      `/v1/admin/observability/traces/${traceId}`,
  },
  settings: {
    /** GET – All app settings grouped by category. */
    list: '/v1/admin/settings',
    /** GET – Single setting by key. */
    detail: (key: string) => `/v1/admin/settings/${key}`,
    /** PATCH – Update a setting value (requires reason). */
    update: (key: string) => `/v1/admin/settings/${key}`,
    /** GET – All image aspect ratio settings. */
    imageAspectRatios: '/v1/admin/settings/images/aspect-ratios',
    /** PATCH – Update a single category's aspect ratio. */
    updateImageAspectRatio: (category: string) =>
      `/v1/admin/settings/images/aspect-ratios/${category}`,
  },
  admins: {
    /** GET – List all admin accounts. */
    list: '/v1/admin/admins',
    /** POST – Create a new admin (superAdmin only). */
    create: '/v1/admin/admins',
    /** GET – Single admin detail. */
    detail: (id: string) => `/v1/admin/admins/${id}`,
    /** PATCH – Update admin role / permissions. */
    update: (id: string) => `/v1/admin/admins/${id}`,
    /** GET – Current admin's own profile. */
    me: '/v1/admin/me',
  },
  uploads: {
    /** POST – Upload an image (any category). */
    image: '/v1/admin/upload/image',
  },
  horoscopes: {
    /** GET – Paginated horoscope list. */
    list: '/v1/admin/horoscopes',
    /** POST – Create a horoscope entry. */
    create: '/v1/admin/horoscopes',
    /** GET – Single horoscope detail. */
    detail: (id: string) => `/v1/admin/horoscopes/${id}`,
    /** PATCH – Update a horoscope entry. */
    update: (id: string) => `/v1/admin/horoscopes/${id}`,
    /** DELETE – Delete a horoscope entry. */
    delete: (id: string) => `/v1/admin/horoscopes/${id}`,
    /** POST – Publish a horoscope. */
    publish: (id: string) => `/v1/admin/horoscopes/${id}/publish`,
    /** POST – Unpublish a horoscope. */
    unpublish: (id: string) => `/v1/admin/horoscopes/${id}/unpublish`,
  },
} as const;

// ─── Public (/v1/public/*) ────────────────────────────────────────────────────

export const PUBLIC_ROUTES = {
  banners: '/v1/public/banners',
  trendingAstrologers: '/v1/public/astrologers/trending',
  stories: '/v1/public/stories',
  learningVideos: '/v1/public/learning-videos',
  /** GET – Today's horoscope for a zodiac sign. */
  todayHoroscope: (sign: string) => `/v1/public/horoscopes/today/${sign}`,
  /** GET – Weekly horoscope for a zodiac sign. */
  weeklyHoroscope: (sign: string) => `/v1/public/horoscopes/weekly/${sign}`,
  /** GET – Monthly horoscope for a zodiac sign. */
  monthlyHoroscope: (sign: string) => `/v1/public/horoscopes/monthly/${sign}`,
  astrologerCategories: '/v1/public/astrologer-categories',
} as const;

// ─── Webhooks (/v1/webhooks/*) ────────────────────────────────────────────────

export const WEBHOOK_ROUTES = {
  /** POST – Payment provider webhook (signature-verified). */
  payment: (providerKey: string) => `/v1/webhooks/payments/${providerKey}`,
  /** POST – Agora channel-closed event. */
  agora: '/v1/webhooks/agora',
} as const;
