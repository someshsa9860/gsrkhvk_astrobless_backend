CREATE TABLE IF NOT EXISTS "kundliProfiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customerId" uuid NOT NULL,
	"label" text NOT NULL,
	"birthDate" date NOT NULL,
	"birthTime" time,
	"birthPlace" text NOT NULL,
	"birthLat" numeric(9, 6) NOT NULL,
	"birthLng" numeric(9, 6) NOT NULL,
	"timezoneOffset" numeric(4, 2) DEFAULT '5.5' NOT NULL,
	"chartData" jsonb,
	"chartComputedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "horoscopes" ALTER COLUMN "date" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "horoscopes" ALTER COLUMN "content" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "registrationCity" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "registrationState" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "registrationCountry" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "registrationCountryCode" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN IF NOT EXISTS "registrationCity" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN IF NOT EXISTS "registrationState" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN IF NOT EXISTS "registrationCountry" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN IF NOT EXISTS "registrationCountryCode" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "period" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "periodKey" text;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "sections" jsonb;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "luckyColor" text;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "luckyNumber" text;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "luckyDay" text;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "generatedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "horoscopes" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kundliProfiles" ADD CONSTRAINT "kundliProfiles_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kundliProfiles_customerId" ON "kundliProfiles" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_horoscopes_sign_period_periodKey" ON "horoscopes" USING btree ("sign","period","periodKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_horoscopes_period_periodKey" ON "horoscopes" USING btree ("period","periodKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_horoscopes_published" ON "horoscopes" USING btree ("isPublished","period","periodKey");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admins" ADD CONSTRAINT "admins_phone_unique" UNIQUE("phone");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
