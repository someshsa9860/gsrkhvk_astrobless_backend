CREATE TABLE IF NOT EXISTS "appleCredentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appleId" text NOT NULL,
	"email" text,
	"name" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appleCredentials_appleId_unique" UNIQUE("appleId")
);
--> statement-breakpoint
ALTER TABLE "astrologers" ADD COLUMN "appleId" text;--> statement-breakpoint
ALTER TABLE "astrologers" ADD CONSTRAINT "astrologers_appleId_unique" UNIQUE("appleId");