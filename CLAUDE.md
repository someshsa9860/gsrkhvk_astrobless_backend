
## Non-negotiable rules (re-read every phase)

1. **Follow `CLAUDE.md` exactly.** When in doubt, quote the section and ask.
2. **camelCase everywhere** — code, DB, JSON.
3. **All admin routes** are under `/v1/admin/*`, behind `requireAudience('astrobless.admin')` AND `requireRole(...)`.
4. **Every state-mutating service method** writes an `auditLog` row with `actorType='admin'`, in the same DB transaction.
5. **Every catch block** that swallows an error calls `errorReporter.report(...)`.
6. **Every route** has a complete Zod schema for OpenAPI generation, tagged `admin:{module}`.
7. **Money is `Float` (DOUBLE PRECISION) in Prisma / `number` in TypeScript.** Stored as decimal rupees (e.g. 12.50 = ₹12.50). Never integer paise subunits.
8. **Every list endpoint** supports: cursor or offset pagination, sort, filter, full-text search, **export trigger** (async to BullMQ).
9. **Every "create" / "update" / "delete" endpoint** logs before/after states.
10. **Sensitive admin actions** (payouts, refunds, manual wallet credits, KYC approvals) require a `reason` field that is mandatory, free-text, audited.
11. **No N+1 queries.** Use Drizzle joins or batched repository methods. Add a perf test if a list endpoint exceeds 200ms p95 with realistic data.

Before each phase, confirm: "I've read CLAUDE.md and the existing modules. Here's my plan for Phase N: [...]". Wait for my approval.

---

## Cross-cutting infrastructure (do this in Phase A1 before anything else)

### A1.1 RBAC system

Roles per CLAUDE.md section 19: `superAdmin`, `ops`, `finance`, `support`, `content`. Add a sixth: `analyst` (read-only, dashboards + reports + logs).

The `AdminPermission` enum (in `packages/sharedConstants/adminPermissions.ts`) defines 34 fine-grained permissions across: dashboard, astrologer management, customer management, consultation access, finance/payouts, content (horoscope/article/banner/push), puja, AstroMall, support tickets, settings, observability (log/audit/error view + resolve), admin management, and export. The `ROLE_PERMISSIONS` map assigns the appropriate permissions to each role. `superAdmin` gets all; other roles get relevant subsets.

Build:
- `requireRole(...roles)` and `requirePermission(...perms)` Fastify preHandlers
- DB column on `admins` table: `customPermissions text[]` for per-admin overrides
- Audit log: every permission denial (`audit.permissionDenied`)

### A1.2 Generic list/filter/search/pagination

Build a reusable `ListQueryInput` type (in `apps/backend/src/admin/shared/listQuery.ts`) with fields: `page` (default 1), `limit` (default 20, max 100), `sort` (e.g. `-createdAt`), `search` (free text), `filters` (resource-specific key-value map), and `cursor` (alternative to page for high-volume). The corresponding `ListQueryResult<T>` type returns: `items`, `page`, `limit`, `total`, `totalPages`, and optional `nextCursor`. Every admin list endpoint uses this contract with a standardized OpenAPI schema.

### A1.3 Export system (mandatory for every list)

Exports are **always async**, never blocking the request. The `exportJobs` table tracks: `id`, `requestedBy` (admin id), `resource` (customers/astrologers/consultations etc.), `format` (csv/xlsx), `filters` (jsonb), `status` (queued/processing/completed/failed/expired), `totalRows`, `fileUrl` (S3 pre-signed URL when complete), `fileSizeBytes`, `errorMessage`, `expiresAt` (7 days after completion), and timestamps.

```
- Endpoint: POST /v1/admin/{resource}/export { format, filters } → returns { exportJobId }
- Endpoint: GET /v1/admin/exports/:id → status + download URL when ready
- Endpoint: GET /v1/admin/exports?status=... → list of admin's recent exports
- BullMQ worker `exportWorker` streams rows from DB → CSV/XLSX → S3 (pre-signed download URL)
- Notification emailed to admin when ready
- Audit: export.requested, export.completed, export.downloaded
```

Build the export framework once; every list endpoint just declares its export shape.

### A1.4 Bulk operations framework

Many admin actions are batch (block 100 customers, approve 50 payouts). Build an `executeBulk` utility (in `apps/backend/src/admin/shared/bulkOperation.ts`) that accepts: a list of items, an operation function, concurrency limit, and audit action name. It returns `{ succeeded, failed }` where `failed` items include the error message. Bulk endpoints follow naming: `POST /v1/admin/customers/bulk-block`, etc. Each writes an audit row per item, plus a summary `bulkOperation.executed` row.

### A1.5 Cron job framework

Many features need scheduled tasks. Build a thin `registerCron(name, cronExpr, handler)` wrapper over BullMQ repeatable jobs (in `apps/backend/src/jobs/scheduler.ts`).

All crons:
- Inherit a synthetic `traceId` per run
- Auto-report errors via `errorReporter`
- Log start/end with duration
- Track in `cronRuns` table: `jobName`, `status` (running/succeeded/failed), `startedAt`, `finishedAt`, `durationMs`, `errorMessage`, `metadata`, `traceId`, `createdAt`
- Visible in admin panel under Settings → Scheduled jobs (with manual "run now" button)

**Stop here.** Show me RBAC working, an export of customers running end-to-end, and a sample cron job firing.

---

## Phase A2 — Dashboard & analytics

**Goal:** real-time dashboards with multiple time-series and aggregate metrics. Fast (cached), accurate, exportable.

### A2.1 Metrics architecture

Two layers:
- **Hot metrics** (computed on-read, cached 60s in Redis) — current online astrologers, active consultations now, today's revenue
- **Aggregated metrics** (precomputed by cron, stored in `metricSnapshots` table) — daily/weekly/monthly trends

The `metricSnapshots` table stores: `metricKey` (e.g. dau/consultations.completed/revenue.gross), `granularity` (hour/day/week/month), `bucketStartAt`, `value` (numeric), `dimensions` (jsonb for slicing by astrologerId/category/providerKey), and `computedAt`. Unique on (metricKey, granularity, bucketStartAt, dimensions).

Cron: `metricsAggregator` runs hourly, computes:
- DAU / WAU / MAU (customer + astrologer)
- New signups per day per persona
- Consultation count + duration + revenue (chat / voice / video split)
- Top astrologers by earning, by rating, by consultation count
- Wallet top-ups by provider, by amount bucket
- Churn proxy: customers inactive 30/60/90 days
- Refund rate
- AI chat usage + cost
- Error rate (from systemErrors)

### A2.2 Dashboard endpoints

```
GET  /v1/admin/dashboard/overview
       → live KPIs (cached 60s):
         - activeConsultationsNow
         - astrologersOnlineNow
         - revenueToday/Week/Month
         - newSignupsToday
         - errorsLast24h (count, severity breakdown)
         - pendingKyc count
         - pendingPayouts count + amount

GET  /v1/admin/dashboard/timeseries
       ?metric=consultations.completed
       &granularity=day
       &from=2026-01-01&to=2026-04-20
       &dimensions[category]=love
       → array of buckets

GET  /v1/admin/dashboard/top-lists
       ?metric=astrologer.earnings|astrologer.rating|customer.spend
       &period=week|month|all
       &limit=10
       → ranked list with values

GET  /v1/admin/dashboard/funnel
       ?funnel=signupToFirstConsultation
       &period=last30d
       → steps with counts and conversion %

GET  /v1/admin/dashboard/cohorts
       ?cohort=signupMonth
       &metric=retention|spend
       → cohort matrix
```

All return shape suitable for Recharts. All export-capable.

### A2.3 Real-time stream

Socket.IO namespace `/admin/dashboard` (RBAC-guarded) emits:
- `metrics:tick` every 5s with live KPIs
- `event:newSignup`, `event:newConsultation`, `event:newError`

Lets the dashboard feel alive without polling.

**Stop here.** Build it, seed with fake historical data, show me the dashboard endpoints rendering meaningful data.

---

## Phase A3 — Astrologer management (admin-side)

### A3.1 List & detail

```
GET  /v1/admin/astrologers
       ?search=&kycStatus=&isOnline=&category=&minRating=&sort=&page=&limit=
       → paginated list with summary fields + computed stats (consultations, earnings, lastActiveAt)

GET  /v1/admin/astrologers/:id
       → full profile + KYC docs (signed URLs) + stats + recent consultations + earnings summary

GET  /v1/admin/astrologers/:id/consultations
       ?status=&from=&to=&type=
       → paginated

GET  /v1/admin/astrologers/:id/earnings
       ?period=
       → earnings breakdown + chart data

GET  /v1/admin/astrologers/:id/reviews
       ?rating=
       → paginated reviews

GET  /v1/admin/astrologers/:id/audit-trail
       → all auditLog entries where targetType='astrologer' and targetId=:id
```

### A3.2 Mutations

```
POST /v1/admin/astrologers
       → admin creates an astrologer account (sends invite email/SMS)

PATCH /v1/admin/astrologers/:id
       → edit profile fields

POST /v1/admin/astrologers/:id/kyc/decide
       { decision: 'approved' | 'rejected', note?: string }
       → approved: marks isVerified=true, fires welcome notification
       → rejected: marks kycStatus='rejected', notifies astrologer with note as reason
       NOTE: there is ONE endpoint for both approve and reject — not two separate routes

POST /v1/admin/astrologers/:id/block
       { reason }
       → soft-block; can't go online or accept new consultations

POST /v1/admin/astrologers/:id/unblock { reason }

POST /v1/admin/astrologers/:id/commission
       { commissionPct, reason }
       → override default commission

POST /v1/admin/astrologers/:id/recharge
       { amount, reason, providerRef? }
       → admin manually credits astrologer's earnings (e.g., bonus, dispute resolution)
       → creates astrologerEarnings row with type='ADMIN_CREDIT'
       → audited heavily; superAdmin/finance only

POST /v1/admin/astrologers/:id/force-logout
       → revokes all astrologer sessions

POST /v1/admin/astrologers/bulk-block
       { astrologerIds: [], reason }

POST /v1/admin/astrologers/export
       → async export
```

### A3.3 Astrologer categories (taxonomy)

The `astrologerCategories` table stores: `slug` (unique, e.g. love-marriage/career/tarot), `title`, `description`, `iconUrl`, `sortOrder`, `isActive`, timestamps.

The `astrologerCategoryAssignments` join table links astrologers to categories via (astrologerId, categoryId) composite primary key.

CRUD endpoints under `/v1/admin/astrologer-categories/*`. Full audit. Reorderable via `PATCH /reorder { ids: [] }`.

Public endpoint `GET /v1/public/astrologer-categories` for mobile.

**Stop here.**

---

## Phase A4 — Customer management

### A4.1 List & detail

```
GET  /v1/admin/customers
       ?search=&isBlocked=&signupSince=&minSpend=&hasConsultations=&sort=&page=&limit=

GET  /v1/admin/customers/:id
       → profile + wallet balance + lifetime stats (consultations, spend, refunds, last active)

GET  /v1/admin/customers/:id/consultations
GET  /v1/admin/customers/:id/wallet/transactions
GET  /v1/admin/customers/:id/orders            // AstroMall
GET  /v1/admin/customers/:id/puja-bookings
GET  /v1/admin/customers/:id/support-tickets
GET  /v1/admin/customers/:id/audit-trail
```

### A4.2 Mutations

```
PATCH /v1/admin/customers/:id
       → name, email, phone (with verification reset)

POST  /v1/admin/customers/:id/block { reason }
POST  /v1/admin/customers/:id/unblock { reason }
POST  /v1/admin/customers/:id/force-logout
DELETE /v1/admin/customers/:id      // GDPR/DPDP delete; anonymizes per CLAUDE.md
```

### A4.3 Wallet adjustments

```
POST /v1/admin/customers/:id/wallet/credit
     { amount, reason, type }
     // type: 'GOODWILL' | 'COMPENSATION' | 'BONUS'
     // creates walletTransactions row, audited

POST /v1/admin/customers/:id/wallet/debit
     { amount, reason }
     // rare; for fraud reversal

POST /v1/admin/customers/:id/refund
     { paymentOrderId, amount, reason }
     // initiates refund via the original provider
     // creates walletTransactions REFUND row
     // audited heavily
```

All wallet mutations require `reason` field. All audited with beforeState/afterState. Finance role only.

### A4.4 Bulk + export

```
POST /v1/admin/customers/bulk-block
POST /v1/admin/customers/bulk-message    // send push/email campaign to filtered set
POST /v1/admin/customers/export
```

**Stop here.**

---

## Phase A5 — Consultations: monitoring, transcripts, recordings

### A5.1 Live & historical

```
GET  /v1/admin/consultations/live
       → currently active consultations (real-time via Socket.IO too)

GET  /v1/admin/consultations
       ?status=&type=&customerId=&astrologerId=&from=&to=&minDuration=&hasReview=
       &sort=&page=&limit=

GET  /v1/admin/consultations/:id
       → full record + customer + astrologer + earnings split + review

GET  /v1/admin/consultations/:id/messages
       ?afterId=&limit=
       → admin can view chat transcript (permission: CONSULTATION_TRANSCRIPT_VIEW)
       → adminViewedMessages audit trail

GET  /v1/admin/consultations/:id/recording
       → if call recording exists & opt-in, returns signed S3 URL
       → permission: CONSULTATION_RECORDING_LISTEN
       → audited every access
```

### A5.2 Mutations

```
POST /v1/admin/consultations/:id/end
     { reason }
     → admin force-ends a stuck consultation, finalizes billing

POST /v1/admin/consultations/:id/refund
     { amount, reason }
     // refunds customer for a complaint
     // optionally claws back from astrologer earnings
     // audited
```

### A5.3 Real-time admin Socket.IO

Admin namespace `/admin/consultations`:
- `consultation:started`, `consultation:ended`, `consultation:lowBalance`
- Lets admin see live activity without polling

**Stop here.**

---

## Phase A6 — Finance: payments, payouts, recharges

### A6.1 Transactions

```
GET  /v1/admin/transactions
       ?type=&direction=&customerId=&from=&to=&minAmount=&providerKey=
       &sort=&page=&limit=
       → flat ledger view across walletTransactions

GET  /v1/admin/transactions/:id
       → full detail with linked references (consultation, paymentOrder, refund)

GET  /v1/admin/payment-orders
       ?status=&providerKey=&from=&to=
       → top-up orders with reconciliation status

GET  /v1/admin/payment-orders/:id
       → full lifecycle including webhook payloads

POST /v1/admin/payment-orders/:id/reconcile
       → admin manually fetches latest status from provider, syncs
```

### A6.2 Payouts (astrologer earnings)

```
GET  /v1/admin/payouts
       ?status=&astrologerId=&period=&from=&to=

GET  /v1/admin/payouts/:id
       → batch detail with line items per consultation

POST /v1/admin/payouts/generate
       { periodStart, periodEnd, dryRun? }
       → manually trigger payout aggregation (also runs weekly via cron)
       → creates payouts rows status='queued'

POST /v1/admin/payouts/:id/approve
       { reason? }
       → marks status='processing', initiates provider call
       → finance role only

POST /v1/admin/payouts/:id/mark-paid
       { providerPayoutId, reason }
       → manual confirmation if webhook missed

POST /v1/admin/payouts/:id/cancel
       { reason }

POST /v1/admin/payouts/bulk-approve { payoutIds: [], reason? }
POST /v1/admin/payouts/export
```

### A6.3 Earning & withdrawal reports

```
GET  /v1/admin/reports/earnings
       ?from=&to=&groupBy=astrologer|category|day|week|month
       → aggregated revenue + commission split

GET  /v1/admin/reports/withdrawals
       ?from=&to=&status=&astrologerId=
       → payout report with running totals

GET  /v1/admin/reports/recharge-history
       ?from=&to=&providerKey=&customerId=
       → top-up funnel

GET  /v1/admin/reports/payment-history
       ?from=&to=&status=
       → all paymentOrders + walletTransactions joined view

GET  /v1/admin/reports/refunds
       ?from=&to=&reason=
       → refund analytics

GET  /v1/admin/reports/financial-summary
       ?period=daily|weekly|monthly
       → P&L style: gross revenue, refunds, commission earned, payout liability, net
```

All reports exportable.

### A6.4 Refund inbox

The `refundRequests` table stores: `id`, `customerId`, `consultationId` (optional), `orderId` (optional), `pujaBookingId` (optional), `amount` (Float, in ₹ e.g. 12.50), `reason` (customer's reason), `status` (pending/approved/rejected), `adminNote`, `decidedBy` (admin id), `decidedAt`, `createdAt`.

```
GET  /v1/admin/refund-requests ?status=&from=
POST /v1/admin/refund-requests/:id/approve { amount?, adminNote }
POST /v1/admin/refund-requests/:id/reject { adminNote }
```

**Stop here.**

---

## Phase A7 — Puja booking system

This is a substantial subsystem. Customers book religious services (pujas) for specific dates, optionally streamed live, paid via wallet OR direct provider checkout.

### A7.1 Data model

All puja tables are described in root `CLAUDE.md §12.15`. Key fields not listed there:
- `pujaTemplates` also has: `subtitle`, `deity`, `occasion` (array), `galleryUrls` (array), `videoUrl`, `samagriIncluded` (jsonb), `samagriRequired` (jsonb)
- `pujaSlots` also has: `timezone` (default Asia/Kolkata), `agoraChannelName`
- `pujaBookings` also has: `paymentMethod` (wallet/provider), `walletTransactionId`, `liveStreamLink`, `recordingUrl`, `completedAt`, `cancelledAt`, `cancelReason`

Additional tables:
- **`pujaPanditAssignments`** — links pandits (astrologers with appropriate specialty) to templates: (pujaTemplateId, astrologerId) composite key, `isPrimary` flag.
- **`pujaBookingTimeline`** — event log per booking: `bookingId`, `event` (created/paid/panditAssigned/started/completed etc.), `actorType`, `actorId`, `note`, `metadata`, `createdAt`.

### A7.2 Customer flow (booking)

The puja booking flow lives under `/v1/customer/puja/*`. Build the customer endpoints first since admin endpoints depend on them.

```
GET  /v1/customer/puja/templates
       ?category=&occasion=&search=
       → list of available pujas

GET  /v1/customer/puja/templates/:slug
       → detail with tiers, included pandits, upcoming slots

GET  /v1/customer/puja/templates/:id/slots
       ?from=&to=
       → available slots

POST /v1/customer/puja/bookings
     {
       pujaTemplateId,
       pujaPackageTierId,
       pujaSlotId?,
       scheduledAt?,         // if no slot, schedule-on-demand
       devoteeName,
       gotra,
       specialRequests,
       deliveryAddress?,
       paymentMethod         // 'wallet' | 'provider'
     }
     → idempotent (Idempotency-Key header)
     → if paymentMethod='wallet': locks wallet funds, creates pujaBookings status='pending', confirms on success
     → if paymentMethod='provider': creates paymentOrder, returns clientPayload
     → on confirm: assigns pandit if not yet assigned, updates pujaSlots.bookedCount

GET  /v1/customer/puja/bookings ?status=
GET  /v1/customer/puja/bookings/:id
POST /v1/customer/puja/bookings/:id/cancel { reason }
       → refund per cancellation policy (admin-configurable)
```

Webhook integration: when paymentOrders for a puja booking succeed → confirm booking.

### A7.3 Admin endpoints

```
// Templates (admin CRUD)
GET    /v1/admin/puja/templates ?category=&isActive=
GET    /v1/admin/puja/templates/:id
POST   /v1/admin/puja/templates
PATCH  /v1/admin/puja/templates/:id
DELETE /v1/admin/puja/templates/:id  // soft delete (isActive=false)

POST   /v1/admin/puja/templates/:id/tiers
PATCH  /v1/admin/puja/templates/:id/tiers/:tierId
DELETE /v1/admin/puja/templates/:id/tiers/:tierId

POST   /v1/admin/puja/templates/:id/pandits     { astrologerIds: [] }
DELETE /v1/admin/puja/templates/:id/pandits/:astrologerId

// Slots
GET    /v1/admin/puja/slots ?templateId=&from=&to=&status=
POST   /v1/admin/puja/slots          // single
POST   /v1/admin/puja/slots/bulk     // generate recurring slots
PATCH  /v1/admin/puja/slots/:id
POST   /v1/admin/puja/slots/:id/cancel { reason }

// Bookings (admin view & manage)
GET    /v1/admin/puja/bookings
       ?status=&customerId=&astrologerId=&from=&to=&search=
GET    /v1/admin/puja/bookings/:id
PATCH  /v1/admin/puja/bookings/:id
       → assign/change pandit, update status, attach recording, etc.
POST   /v1/admin/puja/bookings/:id/refund { amount, reason }
POST   /v1/admin/puja/bookings/:id/timeline { event, note }
       → admin adds manual timeline note

POST   /v1/admin/puja/bookings/export
GET    /v1/admin/puja/reports
       ?from=&to=&groupBy=template|pandit|day
```

### A7.4 Live streaming

If `pujaSlots.isLiveStreamed=true`, integrate Agora Live (separate from per-minute calls). Customer gets `liveStreamLink` 30 min before scheduled time. Recording auto-uploaded to S3 post-puja.

### A7.5 Notifications & cron jobs

- T-24h reminder push + email
- T-1h reminder push
- On `started` → notification with stream link
- On `completed` → review request push
- Cron `pujaBookingReminder` runs every 15 min, fires due reminders
- Cron `pujaSlotGenerator` runs nightly, generates next 30 days of slots from recurring templates
- Cron `pujaBookingExpiry` cancels unpaid pending bookings after 30 min

**Stop here.** Puja is a substantial chunk; demonstrate full booking lifecycle end-to-end with both payment methods.

---

## Phase A8 — Content management

### A8.1 Horoscopes

The `horoscopes` table stores: `zodiacSign`, `period` (daily/weekly/monthly/yearly), `periodStart`, `periodEnd`, `language` (default en), `summary`, separate text fields for love/career/health/wealth, `luckyColor`, `luckyNumber`, `rating` (1–5), `publishedAt`, `isPublished`, `createdBy` (admin id), timestamps. Unique on (zodiacSign, period, periodStart, language).

```
// Admin
GET    /v1/admin/horoscopes ?zodiacSign=&period=&from=&to=&language=&isPublished=
GET    /v1/admin/horoscopes/:id
POST   /v1/admin/horoscopes
PATCH  /v1/admin/horoscopes/:id
DELETE /v1/admin/horoscopes/:id
POST   /v1/admin/horoscopes/bulk-generate
       { period, periodStart, language, useAi? }
       → if useAi=true, generates draft via Claude API (admin reviews before publishing)
POST   /v1/admin/horoscopes/:id/publish
POST   /v1/admin/horoscopes/:id/unpublish

// Public (mobile)
GET    /v1/public/horoscopes/today/:zodiacSign?language=
GET    /v1/public/horoscopes/weekly/:zodiacSign?language=
GET    /v1/public/horoscopes/monthly/:zodiacSign?language=
GET    /v1/public/horoscopes/yearly/:zodiacSign?language=
```

**Cron jobs:**
- `dailyHoroscopeGenerator` — 23:00 IST, generates next day's horoscopes for all 12 signs × all languages (uses Claude API for drafts; admin can review & edit before they auto-publish at midnight)
- `weeklyHoroscopeGenerator` — Sunday 22:00 IST
- `monthlyHoroscopeGenerator` — 1st of month at 03:00 IST
- `yearlyHoroscopeGenerator` — Dec 25th, generates next year's
- `horoscopePublisher` — every hour, publishes any horoscope with `publishedAt <= now`

### A8.2 Articles / blog

The `articles` table stores: `slug` (unique), `title`, `subtitle`, `coverImageUrl`, `body` (markdown), `category`, `tags` (array), `language` (default en), `authorName`, `isPublished`, `publishedAt`, `viewCount`, `createdBy`, timestamps.

CRUD under `/v1/admin/articles/*` and public read at `/v1/public/articles/*`. Search via Meilisearch.

### A8.3 Promotional banners

The `banners` table stores (beyond root CLAUDE.md §12.13): `subtitle`, `audience` (jsonb with genders/minAge/maxAge/languages/cities/excludeCustomerIds for targeting).

```
// Admin CRUD
GET    /v1/admin/banners ?placement=&isActive=&active=true
POST   /v1/admin/banners
PATCH  /v1/admin/banners/:id
DELETE /v1/admin/banners/:id
GET    /v1/admin/banners/:id/analytics    // views, taps, CTR per day

// Public (mobile)
GET    /v1/public/banners ?placement=
       → returns active banners matching customer's audience profile
POST   /v1/public/banners/:id/view        // tracking
POST   /v1/public/banners/:id/tap         // tracking
```

Cron `bannerExpiry` deactivates expired banners hourly.

### A8.4 Push notification campaigns

The `pushCampaigns` table stores: `name`, `title`, `body`, `imageUrl`, `deeplink`, `targetType` (allCustomers/allAstrologers/segment/individual), `segment` (jsonb filter criteria), `recipientIds` (uuid array for individual targeting), `scheduledAt`, `status` (draft/scheduled/sending/sent/failed/cancelled), delivery counts (total/sent/delivered/failed/opened), `createdBy`, `sentAt`, timestamps.

```
// Admin
GET    /v1/admin/push-campaigns
POST   /v1/admin/push-campaigns           // creates draft
PATCH  /v1/admin/push-campaigns/:id       // edit if status=draft|scheduled
POST   /v1/admin/push-campaigns/:id/preview-recipients
       → returns count + sample 10 recipients given segment
POST   /v1/admin/push-campaigns/:id/send-now
POST   /v1/admin/push-campaigns/:id/schedule { scheduledAt }
POST   /v1/admin/push-campaigns/:id/cancel
GET    /v1/admin/push-campaigns/:id/analytics
       → delivery rate, open rate over time
```

Cron `pushCampaignDispatcher` runs every minute, picks scheduled campaigns whose time has come, fans out via BullMQ jobs in batches of 500 FCM tokens (FCM batch limit). Tracks delivery via FCM response + open via deeplink hit.

**Stop here.**

---

## Phase A9 — AstroMall (admin)

### A9.1 Products

```
GET    /v1/admin/products ?category=&isActive=&inStock=&search=
POST   /v1/admin/products
PATCH  /v1/admin/products/:id
DELETE /v1/admin/products/:id
POST   /v1/admin/products/:id/restock { qty, reason }
POST   /v1/admin/products/bulk-import     // CSV upload
POST   /v1/admin/products/export
```

### A9.2 Orders

```
GET    /v1/admin/orders ?status=&from=&to=&customerId=&search=
GET    /v1/admin/orders/:id
PATCH  /v1/admin/orders/:id/status { status, note, trackingNumber? }
       → 'paid' → 'packed' → 'shipped' → 'delivered'; or 'cancelled'
POST   /v1/admin/orders/:id/refund { amount, reason }
POST   /v1/admin/orders/export
```

**Stop here.**

---

## Phase A10 — Support, feedback, tickets

### A10.1 Support tickets

The `supportTickets` table (beyond root CLAUDE.md §12.12) also stores: `linkedConsultationId`, `linkedOrderId`, `linkedPaymentOrderId` for context linking.

The `supportMessages` table has: `ticketId`, `authorType`, `authorId`, `body`, `attachmentUrls`, `isInternalNote` (admin-only note flag), `createdAt`.

```
// User-facing (customer/astrologer creates tickets)
POST  /v1/customer/support/tickets
GET   /v1/customer/support/tickets
GET   /v1/customer/support/tickets/:id
POST  /v1/customer/support/tickets/:id/messages
POST  /v1/customer/support/tickets/:id/close
// Same for /v1/astrologer/support/*

// Admin
GET    /v1/admin/support/tickets ?status=&category=&priority=&assignedTo=&search=
GET    /v1/admin/support/tickets/:id
PATCH  /v1/admin/support/tickets/:id     // status, priority, category
POST   /v1/admin/support/tickets/:id/assign { adminId }
POST   /v1/admin/support/tickets/:id/messages { body, isInternalNote? }
POST   /v1/admin/support/tickets/:id/resolve { resolutionNote }
GET    /v1/admin/support/stats           // open by priority, SLA breaches, agent productivity
```

### A10.2 Feedback

Lightweight: in-app feedback form, app store reviews, NPS surveys.

The `feedback` table stores: `submitterType`, `submitterId`, `type` (general/bug/feature/nps), `rating` (1–10 for NPS, 1–5 for general), `comment`, `appVersion`, `platform`, `metadata` (jsonb), `createdAt`.

```
POST   /v1/customer/feedback           // user submits
POST   /v1/astrologer/feedback
GET    /v1/admin/feedback ?type=&minRating=&from=
GET    /v1/admin/feedback/stats        // NPS over time, sentiment trends
```

**Stop here.**

---

## Phase A11 — Settings & configuration

### A11.1 App settings (key-value)

The `appSettings` table stores: `key` (primary), `value` (jsonb), `description`, `category`, `isSensitive` (masked in UI by default), `updatedBy`, `updatedAt`.

Examples:
- `commission.defaultPct` = `30`
- `wallet.minBalanceFiveMin` = `50.00` (in ₹, e.g. 50.00 = ₹50)
- `consultation.acceptTimeoutSeconds` = `30`
- `consultation.lowBalanceWarningSeconds` = `60`
- `puja.cancellationPolicy` = `{ "before24h": 100, "before12h": 50, "before6h": 25, "after": 0 }`
- `referral.signupBonus` = `50.00` (in ₹, e.g. 50.00 = ₹50)
- `aiChat.enabled` = `true`
- `aiChat.pricePerMessage` = `2.00` (in ₹, e.g. 2.00 = ₹2)
- `featureFlags.videoCallsEnabled` = `false`

```
GET    /v1/admin/settings ?category=
GET    /v1/admin/settings/:key
PATCH  /v1/admin/settings/:key { value, reason }
       → audited; some keys require superAdmin
GET    /v1/admin/settings/audit-trail/:key
       → see who changed what when
```

### A11.2 Cron jobs management

```
GET   /v1/admin/cron-jobs                     // list registered crons
GET   /v1/admin/cron-jobs/:name/runs          // recent runs
POST  /v1/admin/cron-jobs/:name/run-now       // manual trigger
POST  /v1/admin/cron-jobs/:name/pause
POST  /v1/admin/cron-jobs/:name/resume
```

### A11.3 Feature flags

Live in `appSettings` under `featureFlags.*` — special API for convenient toggling:

```
GET    /v1/admin/feature-flags
PATCH  /v1/admin/feature-flags/:flag { enabled, audience? }
```

**Stop here.**

---

## Phase A12 — Admin user management

```
GET    /v1/admin/admins ?role=&isActive=
POST   /v1/admin/admins                       // superAdmin only; sends invite email
PATCH  /v1/admin/admins/:id                   // role, customPermissions, isActive
DELETE /v1/admin/admins/:id                   // soft delete

GET    /v1/admin/admins/:id/sessions          // active sessions
POST   /v1/admin/admins/:id/force-logout

GET    /v1/admin/admins/:id/audit-trail       // their actions
GET    /v1/admin/me                           // current admin profile
PATCH  /v1/admin/me                           // edit own profile
```

Roles & custom permissions managed:
```
GET    /v1/admin/roles
PATCH  /v1/admin/roles/:role/permissions { permissions: [] }
       // superAdmin only
```

**Stop here.**

---

## Phase A13 — Observability endpoints (admin viewer)

These power the **Observability** section in the admin panel from CLAUDE.md section 19.

```
// API logs (queries Loki)
GET   /v1/admin/observability/api-logs
      ?audience=&actorId=&route=&method=&status=&from=&to=&search=&traceId=
      → server proxies to Loki, returns paginated rows

GET   /v1/admin/observability/api-logs/:logId

// Audit trail
GET   /v1/admin/observability/audit
      ?actorType=&actorId=&action=&targetType=&targetId=&from=&to=
GET   /v1/admin/observability/audit/:id

// System errors (CLAUDE.md 11.5)
GET   /v1/admin/observability/errors
      ?severity=&source=&isResolved=&audience=&from=&to=&search=&fingerprint=
GET   /v1/admin/observability/errors/:id
POST  /v1/admin/observability/errors/:id/resolve { resolutionNote }
POST  /v1/admin/observability/errors/:id/reopen
GET   /v1/admin/observability/errors/stats     // counts by severity/source over time

// External calls
GET   /v1/admin/observability/external-calls
      ?target=&statusClass=&from=&to=&traceId=

// Trace viewer
GET   /v1/admin/observability/traces/:traceId
      → consolidated waterfall: API logs + audit entries + external calls + errors with that traceId

// User journey
GET   /v1/admin/observability/user-journey
      ?actorType=&actorId=&from=&to=
      → chronological feed of all activity
```

All viewer access is itself audited (`audit.logView`, `audit.errorView`).

**Stop here.**

---

## Phase A14 — Reports inbox

A unified inbox of generated reports (separate from exports — exports are user-triggered, reports are scheduled).

The `scheduledReports` table stores: `name`, `reportType` (dailyFinancial/weeklyOps/monthlyEarnings etc.), `schedule` (cron expression), `recipients` (admin emails array), `format` (default pdf), `filters` (jsonb), `isActive`, `lastRunAt`, `createdBy`, timestamps.

The `reportRuns` table stores: `scheduledReportId`, `fileUrl`, `status`, `generatedAt`.

```
GET    /v1/admin/scheduled-reports
POST   /v1/admin/scheduled-reports
PATCH  /v1/admin/scheduled-reports/:id
DELETE /v1/admin/scheduled-reports/:id
POST   /v1/admin/scheduled-reports/:id/run-now
GET    /v1/admin/scheduled-reports/:id/runs
GET    /v1/admin/reports/inbox          // all delivered reports for current admin
```

**Stop here.**

---

## Phase A15 — Hardening

1. **Comprehensive integration tests** — every admin endpoint exercised with each role, RBAC denial assertions
2. **Performance** — load test top-10 admin list endpoints with seeded data (1M customers, 100K consultations); ensure p95 < 200ms
3. **Search index** — Meilisearch indexes for: customers (phone, email, name), astrologers (name, phone, email, specialties), products (title, description), articles (title, body), tickets (subject, description)
4. **Caching** — Redis cache layer for hot reads (settings, categories, banners, dashboard tiles)
5. **OpenAPI spec polish** — examples on every key schema, descriptions on every field, all tags grouped logically
6. **CSV/XLSX export workers** — proven against largest tables (1M rows < 60s)
7. **Documentation** — `docs/admin-api.md` with onboarding for new devs

---

## How I'll work with you

- One phase at a time
- At end of each phase: summary + key files + Swagger screenshot + test pass output
- Stop after each phase; wait for my approval
- If a decision isn't covered by CLAUDE.md, stop and ask
- Keep diffs small; Conventional Commits
- Update CLAUDE.md when you make a decision worth preserving

---

## Decisions recorded (2026-04-21)

### MSG91 OTP delivery (locked)

All OTP delivery (phone SMS + email OTP) uses **MSG91** — not AWS SES, not Twilio.

**SMS OTP:** POST to `https://control.msg91.com/api/v5/otp` with `authkey: MSG91_AUTH_KEY` header. Body: `{ template_id, mobile, otp, otp_expiry: 5 }`. Mobile format: `91XXXXXXXXXX` (no `+`). OTP TTL: 5 minutes.

**Email OTP:** POST to `https://api.msg91.com/api/v5/email/send` with same auth header. Body: `{ to, from: { email: MSG91_FROM_EMAIL, name: 'Astrobless' }, domain: MSG91_EMAIL_DOMAIN, template_id: MSG91_EMAIL_OTP_TEMPLATE_ID, variables: { otp, name } }`.

**Test mode:** When `TEST_OTP=true` (local/dev only), the backend accepts OTP `123456` for any phone/email without calling MSG91. This must NEVER be enabled in staging or production.

**Rate limits (enforced in Redis before calling MSG91):**
- Phone OTP: 5 / hour / phone, 20 / hour / IP
- Email OTP: 3 / hour / email, 10 / hour / IP
- Wrong attempts: 3 per OTP → invalidate; 10 in 1 hour → 15-min lockout

**Error codes surfaced to clients:**
- `OTP_INVALID` — wrong code
- `OTP_EXPIRED` — TTL elapsed
- `OTP_ATTEMPTS_EXCEEDED` — too many wrong attempts
- `RATE_LIMIT` — send-OTP rate limit hit (include `retryAfterSeconds` in error details)

---

### Kundli report requests (new consultation type — MVP)

Kundli reports are asynchronous consultations: the customer submits birth details and the astrologer prepares a written interpretation within a chosen SLA (6h / 12h / 24h).

**New table: `kundliRequests`** — see `partner_app/CLAUDE.md §13.3` for the full schema.

**Astrologer-side endpoints** (audience: `astrobless.astrologer`):
```
GET  /v1/astrologer/kundli-requests           ?status&page&limit
GET  /v1/astrologer/kundli-requests/:id
POST /v1/astrologer/kundli-requests/:id/accept  { slaDurationHours: 6|12|24 }
POST /v1/astrologer/kundli-requests/:id/decline { reason }
POST /v1/astrologer/kundli-requests/:id/submit  { reportText, reportPdfS3Key? }
GET  /v1/astrologer/kundli-requests/:id/chart   → computed planets/houses
GET  /v1/astrologer/kundli-requests/upload-url  ?docType=kundliReport
```

**Customer-side endpoints** (audience: `astrobless.customer`):
```
POST /v1/customer/kundli-requests             { astrologerId, birthDate, birthTime, birthPlace, birthLat, birthLng, question? }
GET  /v1/customer/kundli-requests             ?status&page&limit
GET  /v1/customer/kundli-requests/:id
POST /v1/customer/kundli-requests/:id/cancel
```

**Admin-side endpoints** (audience: `astrobless.admin`):
```
GET  /v1/admin/kundli-requests                ?status&astrologerId&customerId&from&to&page&limit
GET  /v1/admin/kundli-requests/:id
POST /v1/admin/kundli-requests/:id/refund     { reason }
```

**Socket.IO events:**
- `kundli:request` — server → astrologer when a new request arrives
- `kundli:accepted` — server → customer when astrologer accepts
- `kundli:completed` — server → customer when report is submitted
- `kundli:declined` — server → customer when astrologer declines

**Billing:** Kundli reports are **fixed price** (not per-minute). The customer's wallet is debited at request creation, held in locked funds until the report is completed. On completion → release to platform + astrologer earning. On decline/expiry → full refund.

**SLA enforcement:** BullMQ scheduled job checks every 30 minutes for requests past their `slaDueAt`. Overdue requests auto-escalate to admin and send a warning FCM to the astrologer.

---

### Partner app (astrologer) auth — confirmed supported methods

- Phone OTP via MSG91 SMS ✅ (primary)
- Email + password with email OTP verification via MSG91 Email ✅
- Google OAuth ❌ (never for astrologers)
- Apple Sign-In ❌ (never for astrologers)
- TOTP 2FA optional (not mandatory for MVP)

The astrologer persona follows the exact same auth patterns as documented in root `CLAUDE.md §6`, with the MSG91 transport confirmed above.

---

### Admin login — email+password and TOTP removed (locked)

The `POST /v1/admin/auth/login` (email+password) endpoint does **not exist**. TOTP has also been **completely removed**. Admin auth is now single-step:

1. Google OAuth (for Google Workspace accounts) — verify idToken → issue JWT directly
2. Email OTP (for non-Google accounts) — verify OTP → issue JWT directly

Both paths return `{ accessToken, refreshToken, admin: { id, email, name, role, customPermissions } }` immediately. There is no intermediate `tempToken`, no `/admin/auth/totp` endpoint, no `/admin/auth/totp/enroll` endpoint.

No admin has a `passwordHash` or `totpSecret`. Those columns do not exist on the `admins` table.

**What was removed from `adminAuth.service.ts`:** `adminVerifyTotp`, `beginTotpEnrollment`, `confirmTotpEnrollment`, `skipTotp`, `setTempToken`, `getTempToken`, `deleteTempToken`, `adminTempTokenKey`.

**Dependencies removed from `backend/package.json`:** `otplib`, `qrcode`, `@types/qrcode`.

---

### Login page UI (2026-04-21)

The admin panel login page has been redesigned with a split layout:
- Left panel: dark navy (`#0d0b1e`) with celestial mandala SVG, star field, Astrobless logo, platform stats
- Right panel: clean white/light form with logo (mobile only), "Welcome back" heading, Google button, email OTP form, security note
- No Card wrapper — raw divs with `space-y-7`
- The `(auth)/layout.tsx` renders the full split layout; auth pages render content directly

All auth pages (signin, otp) follow the same pattern: no `<Card>` wrapper, heading + subtext + form.

---

### New schema models added (2026-04-21)

The following 15 models were added to the Drizzle schema. Backend modules/endpoints should be built for each:

**Social & engagement:**
- `astrologerFollowers` — customer follows an astrologer; endpoints: `POST/DELETE /v1/customer/astrologers/:id/follow`, `GET /v1/customer/astrologers/following`
- `astrologerBlocks` — customer blocks an astrologer (hides from browse); endpoints: `POST/DELETE /v1/customer/astrologers/:id/block`

**Referrals & promotions:**
- `referralRewards` — tracks referral conversions and rewards; auto-created by the referral service on `firstConsultation` event
- `rechargePacks` — admin-managed wallet top-up packs shown in the top-up screen; endpoints: `GET /v1/public/recharge-packs`, `GET/POST/PATCH/DELETE /v1/admin/recharge-packs`
- `coupons` + `couponRedemptions` — discount codes; endpoints: `POST /v1/customer/wallet/topup { couponCode? }`, `GET/POST/PATCH/DELETE /v1/admin/coupons`

**Customer data:**
- `customerAddresses` — saved delivery addresses; endpoints: `GET/POST/PATCH/DELETE /v1/customer/addresses`

**Support:**
- `supportTickets` + `supportMessages` — in-app support; endpoints: `POST/GET /v1/customer/support/tickets`, `POST/GET /v1/astrologer/support/tickets`, full admin CRUD under `/v1/admin/support/tickets`

**Content:**
- `banners` — promotional banners; endpoints: `GET /v1/public/banners?placement=`, admin CRUD under `/v1/admin/banners`

**Kundli:**
- `kundliMatches` — cached compatibility match results; endpoints: `POST /v1/customer/kundli/match { profileAId, profileBId }`, `GET /v1/customer/kundli/matches`

**Puja system (4 models):** `pujaTemplates`, `pujaPackageTiers`, `pujaSlots`, `pujaBookings` — full endpoint spec in `backend/CLAUDE.md §Phase A7` above.

**Consultation fields added:**
- `recordingUrl` — Agora cloud recording URL (set post-call if opted in)
- `recordingExpiresAt` — 90-day retention policy enforcement
- `lastHeartbeatAt` — last billing tick timestamp for stuck-consultation detection

---

### Fastify querystring schema pattern (2026-04-21, locked)

**Problem:** Zod `.default()` on querystring fields generates invalid JSON Schema `required` array format, causing `FastifyError: Failed building the validation schema … data/required must be array` on startup.

**Rule:** Admin route querystring schemas must use `.optional()` not `.default()` on all fields. Handle defaults in the service layer with `?? defaultValue`. For example, `page: z.coerce.number().int().min(1).optional()` in the schema, then `q.page ?? 1` in the service.

### Fastify route plugin pattern (2026-04-21, locked)

All admin routes use `FastifyPluginAsync` + `zodToJsonSchema()`, **not** `FastifyPluginAsyncZod` with direct Zod schema objects. This matches all working admin route modules (astrologers, customers, etc.).

The correct pattern: import `FastifyPluginAsync` from `fastify` and `zodToJsonSchema` from `zod-to-json-schema`. Register routes with `schema: { querystring: zodToJsonSchema(XxxListQuerySchema), response: { 200: zodToJsonSchema(XxxResultSchema) } }`.

The wrong pattern (`FastifyPluginAsyncZod` with a direct Zod object as the `querystring` schema) breaks on Fastify v4 + zod-fastify-type-provider.

The canonical example of the correct pattern is `admin/content/adminHoroscopes.routes.ts`.

### ORM: Prisma (locked, 2026-04-25)

**Prisma** is the ORM in use — not Drizzle. All DB access uses the `prisma` client from `src/db/client.ts`. Schema at `prisma/schema.prisma`. All table/column names are `camelCase` with `@@map`/`@map` decorators. Rule 11 references "Drizzle joins" — read that as Prisma `include`/`select`.

### Kundli matching endpoints (2026-04-25)

`POST /v1/customer/kundli/match` and `GET /v1/customer/kundli/matches` are implemented in `src/modules/kundli/kundli.routes.ts` + `kundli.service.ts`.

`getKundliMatch(boy, girl)` in `src/lib/vedicAstroClient.ts` calls `/matching/ashtakoot-points` with `m_` / `f_` prefixed birth params. Returns `KundliMatchResult` with `totalPoints`, `scoreLabel`, per-koota `breakdown`, `conclusion`, `manglikBoy`, `manglikGirl`. Results are persisted to `kundliMatches` table.

### FCM notifications — wallet and earnings (2026-04-25)

`sendPush()` from `src/modules/notifications/notifications.service.ts` is called fire-and-forget at:
- `wallet.service.ts` `applyTopupCredit` — notifies customer after topup webhook
- `wallet.service.ts` `debitWallet` — notifies customer after each consultation minute debit
- `adminCustomers.service.ts` `walletCredit` — notifies customer after admin manual credit
- `consultations.service.ts` `endConsultation` — notifies astrologer with earnings amount

All calls use `.catch(() => {})` to never block the critical path.

### Banner schema field names (locked, 2026-04-25)

Prisma `Banner` model uses: `imageKey` (S3 storage key), `startsAt`, `endsAt`. The admin banner service (`src/admin/content/adminBanners.service.ts`) calls `keyToUrl(imageKey)` and adds `imageUrl` to every response row. Admin panel and Flutter must use `imageKey`/`startsAt`/`endsAt` in request bodies — never `imageUrl`/`startAt`/`endAt`.

### reason fields — optional in most admin schemas (2026-04-25)

`reason: z.string().optional()` in: `BlockCustomerSchema`, `WalletAdjustSchema`, `BlockAstrologerSchema`, `AppSettingsUpdateSchema`. `CommissionOverrideSchema.reason` stays `z.string().min(3)` (required) because commission changes are high-impact financial actions.
