-- Migration: 0001_horoscopes_expand
-- Expands the horoscopes table to support daily/weekly/monthly/yearly periods,
-- rich Vedic sections (love/career/health/wealth), lucky fields, source tracking,
-- and proper indexing for admin queries.

-- 1. Add new columns (all nullable / with defaults so existing rows are unaffected)
ALTER TABLE "horoscopes"
  ADD COLUMN IF NOT EXISTS "period"      text        NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS "periodKey"   text,
  ADD COLUMN IF NOT EXISTS "sections"    jsonb,
  ADD COLUMN IF NOT EXISTS "luckyColor"  text,
  ADD COLUMN IF NOT EXISTS "luckyNumber" text,
  ADD COLUMN IF NOT EXISTS "luckyDay"    text,
  ADD COLUMN IF NOT EXISTS "source"      text        NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "generatedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "updatedAt"   timestamptz NOT NULL DEFAULT now();

-- 2. Backfill periodKey from the existing date column
UPDATE "horoscopes" SET "periodKey" = "date" WHERE "periodKey" IS NULL;

-- 3. Make periodKey NOT NULL now that it's populated
ALTER TABLE "horoscopes" ALTER COLUMN "periodKey" SET NOT NULL;

-- 4. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "idx_horoscopes_sign_period_periodKey"
  ON "horoscopes" ("sign", "period", "periodKey");

CREATE INDEX IF NOT EXISTS "idx_horoscopes_period_periodKey"
  ON "horoscopes" ("period", "periodKey");

CREATE INDEX IF NOT EXISTS "idx_horoscopes_published"
  ON "horoscopes" ("isPublished", "period", "periodKey" DESC);
