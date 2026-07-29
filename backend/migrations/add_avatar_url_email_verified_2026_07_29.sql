-- ============================================================
-- Add missing users columns: avatar_url, email_verified,
-- email_verify_code, employee_id, reporting_to, status
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
--
-- Run on production:
--   psql -U lumos_admin -d lumos_hrms -f backend/migrations/add_avatar_url_email_verified_2026_07_29.sql
-- Or via Docker:
--   docker exec -i lumos_postgres psql -U lumos_admin -d lumos_hrms < backend/migrations/add_avatar_url_email_verified_2026_07_29.sql
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url          TEXT,
  ADD COLUMN IF NOT EXISTS email_verified      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verify_code   TEXT,
  ADD COLUMN IF NOT EXISTS employee_id         TEXT,
  ADD COLUMN IF NOT EXISTS reporting_to        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'active';

-- Verification
SELECT
  column_name,
  CASE WHEN column_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('avatar_url', 'email_verified', 'email_verify_code', 'employee_id', 'reporting_to', 'status')
ORDER BY column_name;
