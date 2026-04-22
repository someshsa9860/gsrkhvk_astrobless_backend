CREATE TABLE IF NOT EXISTS "customerAuthIdentities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerId" uuid NOT NULL,
	"providerKey" text NOT NULL,
	"providerUserId" text NOT NULL,
	"passwordHash" text,
	"lastUsedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"email" text,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"name" text,
	"gender" text,
	"dob" date,
	"birthTime" time,
	"birthPlace" text,
	"birthLat" numeric(9, 6),
	"birthLng" numeric(9, 6),
	"profileImageUrl" text,
	"referralCode" text,
	"referredBy" uuid,
	"isBlocked" boolean DEFAULT false NOT NULL,
	"blockedReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_email_unique" UNIQUE("email"),
	CONSTRAINT "customers_referralCode_unique" UNIQUE("referralCode")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "astrologerAuthIdentities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologerId" uuid NOT NULL,
	"providerKey" text NOT NULL,
	"providerUserId" text NOT NULL,
	"passwordHash" text,
	"lastUsedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "astrologers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"email" text,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"displayName" text NOT NULL,
	"legalName" text,
	"bio" text,
	"profileImageUrl" text,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"specialties" text[] DEFAULT '{}' NOT NULL,
	"experienceYears" integer DEFAULT 0 NOT NULL,
	"pricePerMinChatPaise" integer NOT NULL,
	"pricePerMinCallPaise" integer NOT NULL,
	"pricePerMinVideoPaise" integer NOT NULL,
	"isOnline" boolean DEFAULT false NOT NULL,
	"isBusy" boolean DEFAULT false NOT NULL,
	"isVerified" boolean DEFAULT false NOT NULL,
	"ratingAvg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"ratingCount" integer DEFAULT 0 NOT NULL,
	"totalConsultations" integer DEFAULT 0 NOT NULL,
	"totalEarningsPaise" bigint NOT NULL,
	"kycStatus" text DEFAULT 'pending' NOT NULL,
	"panNumber" text,
	"aadhaarLast4" text,
	"upiId" text,
	"kycDocsRef" jsonb,
	"bankAccountRef" jsonb,
	"commissionPct" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"isBlocked" boolean DEFAULT false NOT NULL,
	"blockedReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "astrologers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "astrologers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"totpSecret" text,
	"totpEnrolled" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"lastLoginAt" timestamp with time zone,
	"customPermissions" text[],
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "authSessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" text NOT NULL,
	"subjectId" uuid NOT NULL,
	"sessionId" text NOT NULL,
	"refreshTokenHash" text NOT NULL,
	"userAgent" text,
	"ipAddress" text,
	"issuedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revokedAt" timestamp with time zone,
	"revokedReason" text,
	"replacedBy" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paymentOrders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerId" uuid NOT NULL,
	"providerKey" text NOT NULL,
	"providerOrderId" text,
	"providerPaymentId" text,
	"amountPaise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text NOT NULL,
	"idempotencyKey" text NOT NULL,
	"clientPayload" text,
	"webhookPayload" text,
	"failureReason" text,
	"expiresAt" timestamp with time zone,
	"paidAt" timestamp with time zone,
	"traceId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paymentOrders_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "walletTransactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"walletId" uuid NOT NULL,
	"customerId" uuid NOT NULL,
	"type" text NOT NULL,
	"direction" text NOT NULL,
	"amountPaise" bigint NOT NULL,
	"balanceAfterPaise" bigint NOT NULL,
	"referenceType" text,
	"referenceId" uuid,
	"idempotencyKey" text,
	"notes" text,
	"traceId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walletTransactions_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerId" uuid NOT NULL,
	"balancePaise" bigint NOT NULL,
	"lockedPaise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_customerId_unique" UNIQUE("customerId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "astrologerEarnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologerId" uuid NOT NULL,
	"consultationId" uuid NOT NULL,
	"grossPaise" bigint NOT NULL,
	"commissionPct" numeric(5, 2) NOT NULL,
	"commissionPaise" bigint NOT NULL,
	"netPaise" bigint NOT NULL,
	"settledPayoutId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerId" uuid NOT NULL,
	"astrologerId" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"pricePerMinPaise" integer NOT NULL,
	"commissionPct" numeric(5, 2) NOT NULL,
	"requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"acceptedAt" timestamp with time zone,
	"startedAt" timestamp with time zone,
	"endedAt" timestamp with time zone,
	"durationSeconds" integer DEFAULT 0 NOT NULL,
	"totalChargedPaise" bigint NOT NULL,
	"astrologerEarningPaise" bigint NOT NULL,
	"platformEarningPaise" bigint NOT NULL,
	"endReason" text,
	"agoraChannelName" text,
	"traceId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultationId" uuid NOT NULL,
	"senderType" text NOT NULL,
	"senderId" uuid,
	"type" text NOT NULL,
	"body" text,
	"mediaUrl" text,
	"clientMsgId" text,
	"isFlagged" boolean DEFAULT false NOT NULL,
	"readAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologerId" uuid NOT NULL,
	"providerKey" text NOT NULL,
	"providerPayoutId" text,
	"amountPaise" bigint NOT NULL,
	"status" text NOT NULL,
	"periodStart" timestamp with time zone NOT NULL,
	"periodEnd" timestamp with time zone NOT NULL,
	"idempotencyKey" text NOT NULL,
	"failureReason" text,
	"processedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultationId" uuid NOT NULL,
	"customerId" uuid NOT NULL,
	"astrologerId" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"isHidden" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_consultationId_unique" UNIQUE("consultationId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "birthCharts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerId" uuid NOT NULL,
	"chartData" jsonb NOT NULL,
	"computedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fcmTokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerType" text NOT NULL,
	"ownerId" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fcmTokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "horoscopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sign" text NOT NULL,
	"date" text NOT NULL,
	"content" text NOT NULL,
	"isPublished" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipientType" text NOT NULL,
	"recipientId" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"data" jsonb,
	"readAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auditLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorType" text NOT NULL,
	"actorId" uuid,
	"action" text NOT NULL,
	"targetType" text,
	"targetId" uuid,
	"summary" text NOT NULL,
	"beforeState" jsonb,
	"afterState" jsonb,
	"metadata" jsonb,
	"traceId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "systemErrors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"traceId" text,
	"errorCode" text,
	"errorName" text NOT NULL,
	"errorMessage" text NOT NULL,
	"stackTrace" text,
	"severity" text NOT NULL,
	"source" text NOT NULL,
	"sourceDetail" text,
	"audience" text,
	"actorType" text,
	"actorId" uuid,
	"httpMethod" text,
	"httpPath" text,
	"httpStatusCode" integer,
	"requestId" text,
	"serverHostname" text,
	"serverRegion" text,
	"appVersion" text,
	"platform" text,
	"environment" text NOT NULL,
	"metadata" jsonb,
	"fingerprint" text NOT NULL,
	"occurrenceCount" integer DEFAULT 1 NOT NULL,
	"firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"isResolved" boolean DEFAULT false NOT NULL,
	"resolvedBy" uuid,
	"resolvedAt" timestamp with time zone,
	"resolutionNote" text,
	"sentryEventId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orderItems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"qty" integer NOT NULL,
	"pricePaise" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerId" uuid NOT NULL,
	"totalPaise" bigint NOT NULL,
	"status" text NOT NULL,
	"shippingAddress" jsonb,
	"paymentOrderId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"pricePaise" bigint NOT NULL,
	"category" text,
	"images" text[] DEFAULT '{}' NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appSettings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"category" text,
	"isSensitive" boolean DEFAULT false NOT NULL,
	"updatedBy" uuid,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cronRuns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jobName" text NOT NULL,
	"status" text NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"finishedAt" timestamp with time zone,
	"durationMs" integer,
	"errorMessage" text,
	"traceId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exportJobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestedBy" uuid NOT NULL,
	"resource" text NOT NULL,
	"format" text NOT NULL,
	"filters" jsonb,
	"status" text NOT NULL,
	"totalRows" integer,
	"fileUrl" text,
	"fileSizeBytes" bigint,
	"errorMessage" text,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customerAuthIdentities" ADD CONSTRAINT "customerAuthIdentities_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "astrologerAuthIdentities" ADD CONSTRAINT "astrologerAuthIdentities_astrologerId_astrologers_id_fk" FOREIGN KEY ("astrologerId") REFERENCES "public"."astrologers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paymentOrders" ADD CONSTRAINT "paymentOrders_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "walletTransactions" ADD CONSTRAINT "walletTransactions_walletId_wallets_id_fk" FOREIGN KEY ("walletId") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "walletTransactions" ADD CONSTRAINT "walletTransactions_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "astrologerEarnings" ADD CONSTRAINT "astrologerEarnings_astrologerId_astrologers_id_fk" FOREIGN KEY ("astrologerId") REFERENCES "public"."astrologers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "astrologerEarnings" ADD CONSTRAINT "astrologerEarnings_consultationId_consultations_id_fk" FOREIGN KEY ("consultationId") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultations" ADD CONSTRAINT "consultations_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consultations" ADD CONSTRAINT "consultations_astrologerId_astrologers_id_fk" FOREIGN KEY ("astrologerId") REFERENCES "public"."astrologers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_consultationId_consultations_id_fk" FOREIGN KEY ("consultationId") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payouts" ADD CONSTRAINT "payouts_astrologerId_astrologers_id_fk" FOREIGN KEY ("astrologerId") REFERENCES "public"."astrologers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_consultationId_consultations_id_fk" FOREIGN KEY ("consultationId") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_astrologerId_astrologers_id_fk" FOREIGN KEY ("astrologerId") REFERENCES "public"."astrologers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "birthCharts" ADD CONSTRAINT "birthCharts_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_paymentOrderId_paymentOrders_id_fk" FOREIGN KEY ("paymentOrderId") REFERENCES "public"."paymentOrders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appSettings" ADD CONSTRAINT "appSettings_updatedBy_admins_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exportJobs" ADD CONSTRAINT "exportJobs_requestedBy_admins_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_authSessions_audience_subjectId" ON "authSessions" USING btree ("audience","subjectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_walletTransactions_customerId_createdAt" ON "walletTransactions" USING btree ("customerId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consultations_customerId" ON "consultations" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consultations_astrologerId" ON "consultations" USING btree ("astrologerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consultations_status" ON "consultations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_consultationId_createdAt" ON "messages" USING btree ("consultationId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fcmTokens_owner" ON "fcmTokens" USING btree ("ownerType","ownerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_recipient" ON "notifications" USING btree ("recipientType","recipientId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auditLog_actorId_createdAt" ON "auditLog" USING btree ("actorType","actorId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auditLog_targetId" ON "auditLog" USING btree ("targetType","targetId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auditLog_action" ON "auditLog" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auditLog_traceId" ON "auditLog" USING btree ("traceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_systemErrors_fingerprint" ON "systemErrors" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_systemErrors_createdAt" ON "systemErrors" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_systemErrors_severity" ON "systemErrors" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_systemErrors_isResolved" ON "systemErrors" USING btree ("isResolved","lastSeenAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_systemErrors_source" ON "systemErrors" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cronRuns_jobName_startedAt" ON "cronRuns" USING btree ("jobName","startedAt");