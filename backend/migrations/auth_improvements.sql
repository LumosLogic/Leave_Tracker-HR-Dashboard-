-- ============================================================
-- Migration: Auth Improvements + Org Registration Hardening
-- Run in pgAdmin or psql on your Hostinger VPS PostgreSQL DB
--
-- What this does:
--   1. Enforce globally unique emails in the users table
--   2. Add GST, company_size, industry to org_registration_requests
--   3. Partial unique index on gst_number (non-null only)
--
-- SAFE TO RUN: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ============================================================

-- ─── STEP 1: Check for duplicate emails before adding constraint ──────────────
-- Run this SELECT first. If it returns rows, resolve them manually before step 2.
-- SELECT email, COUNT(*) as cnt FROM users GROUP BY email HAVING COUNT(*) > 1;

-- ─── STEP 2: Global unique email constraint on users ─────────────────────────
-- Drop the constraint if it already exists under a different name, then recreate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_unique' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;

-- ─── STEP 3: Add new columns to org_registration_requests ────────────────────
ALTER TABLE org_registration_requests
  ADD COLUMN IF NOT EXISTS gst_number   TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT,
  ADD COLUMN IF NOT EXISTS industry     TEXT;

-- ─── STEP 4: Partial unique index on gst_number (ignores NULLs) ──────────────
-- This prevents two approved/pending requests from using the same GST number
-- while allowing NULL for orgs that don't provide one.
CREATE UNIQUE INDEX IF NOT EXISTS org_requests_gst_unique
  ON org_registration_requests (gst_number)
  WHERE gst_number IS NOT NULL;

-- ─── STEP 5: Unique index on organizations.slug (should already exist) ───────
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique
  ON organizations (slug);

-- ─── STEP 6: Case-insensitive index on organizations.name ────────────────────
-- Enables fast ilike lookups for duplicate name detection
CREATE INDEX IF NOT EXISTS organizations_name_lower_idx
  ON organizations (LOWER(name));

-- ─── STEP 7: Case-insensitive index on org_registration_requests.company_name ─
CREATE INDEX IF NOT EXISTS org_requests_company_name_lower_idx
  ON org_registration_requests (LOWER(company_name));

-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================
-- SELECT conname, contype FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_email_unique';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'org_registration_requests' AND column_name IN ('gst_number','company_size','industry');
-- SELECT indexname FROM pg_indexes WHERE tablename = 'org_registration_requests' AND indexname = 'org_requests_gst_unique';
