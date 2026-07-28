-- ============================================================
-- Auth Improvements Migration
-- Lumos Logic HRMS
--
-- Run:
--   docker exec -i lumos_postgres psql -U lumos_admin -d lumos_hrms < backend/migrations/auth_improvements.sql
--
-- BEFORE RUNNING: check for duplicate emails first:
--   docker exec -i lumos_postgres psql -U lumos_admin -d lumos_hrms -c \
--   "SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;"
--   If any rows come back, resolve them before running this file.
-- ============================================================

\echo '>>> Step 1: Global UNIQUE constraint on users.email'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_unique'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
    RAISE NOTICE 'users_email_unique created';
  ELSE
    RAISE NOTICE 'users_email_unique already exists, skipped';
  END IF;
END $$;

\echo '>>> Step 2: Add gst_number, company_size, industry to org_registration_requests'

ALTER TABLE org_registration_requests
  ADD COLUMN IF NOT EXISTS gst_number   TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT,
  ADD COLUMN IF NOT EXISTS industry     TEXT;

\echo '>>> Step 3: Partial unique index on gst_number (NULLs are excluded)'

CREATE UNIQUE INDEX IF NOT EXISTS org_requests_gst_unique
  ON org_registration_requests (gst_number)
  WHERE gst_number IS NOT NULL;

\echo '>>> Step 4: Unique index on organizations.slug'

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique
  ON organizations (slug);

\echo '>>> Step 5: Case-insensitive index on organizations.name'

CREATE INDEX IF NOT EXISTS organizations_name_lower_idx
  ON organizations (LOWER(name));

\echo '>>> Step 6: Case-insensitive index on org_registration_requests.company_name'

CREATE INDEX IF NOT EXISTS org_requests_company_name_lower_idx
  ON org_registration_requests (LOWER(company_name));

\echo '>>> Verification'

SELECT
  'users_email_unique constraint'        AS check_name,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END AS status
FROM pg_constraint
WHERE conname = 'users_email_unique' AND conrelid = 'users'::regclass

UNION ALL

SELECT
  'gst_number column',
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END
FROM information_schema.columns
WHERE table_name = 'org_registration_requests' AND column_name = 'gst_number'

UNION ALL

SELECT
  'company_size column',
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END
FROM information_schema.columns
WHERE table_name = 'org_registration_requests' AND column_name = 'company_size'

UNION ALL

SELECT
  'industry column',
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END
FROM information_schema.columns
WHERE table_name = 'org_registration_requests' AND column_name = 'industry'

UNION ALL

SELECT
  'org_requests_gst_unique index',
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END
FROM pg_indexes
WHERE indexname = 'org_requests_gst_unique'

UNION ALL

SELECT
  'organizations_slug_unique index',
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END
FROM pg_indexes
WHERE indexname = 'organizations_slug_unique'

UNION ALL

SELECT
  'organizations_name_lower_idx index',
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END
FROM pg_indexes
WHERE indexname = 'organizations_name_lower_idx'

UNION ALL

SELECT
  'org_requests_company_name_lower_idx index',
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING' END
FROM pg_indexes
WHERE indexname = 'org_requests_company_name_lower_idx';

\echo '>>> Done'
