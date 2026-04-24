ALTER TABLE "customers" ADD COLUMN "appleId" text;--> statement-breakpoint
ALTER TABLE "authSessions" ADD COLUMN "deviceId" text;--> statement-breakpoint
ALTER TABLE "authSessions" ADD COLUMN "deviceModel" text;--> statement-breakpoint
ALTER TABLE "authSessions" ADD COLUMN "deviceName" text;--> statement-breakpoint
ALTER TABLE "authSessions" ADD COLUMN "osName" text;--> statement-breakpoint
ALTER TABLE "authSessions" ADD COLUMN "osVersion" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_appleId_unique" UNIQUE("appleId");