-- Expanded astrologer profile: whatsapp, dob, category, USD pricing, background, social links, availability
ALTER TABLE "astrologers" ADD COLUMN "whatsappNumber" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "dob" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "astroblessCategory" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "primarySkill" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "pricePerMinCallUsd" integer;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "pricePerMinVideoUsd" integer;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "pricePerReportPaise" integer;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "pricePerReportUsd" integer;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "onboardingReason" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "interviewTime" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "currentCity" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "otherBusinessSource" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "highestQualification" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "degreeDiploma" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "collegeUniversity" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "astrologySources" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "instagramUrl" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "facebookUrl" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "linkedinUrl" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "youtubeUrl" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "availability" jsonb;
