-- ============================================================
-- HIGH-13: Add email_verify_code_expires column
-- Allows email verification codes to have a 30-minute TTL.
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
--
-- Run on production:
--   psql -U lumos_admin -d lumos_hrms -f backend/migrations/add_email_verify_expires_2026_07_29.sql
-- Or:
--   docker exec -i lumos_postgres psql -U lumos_admin -d lumos_hrms < /tmp/add_email_verify_expires_2026_07_29.sql
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verify_code_expires TIMESTAMPTZ;

-- Nullify any existing codes so they can't be used without the new expiry set
UPDATE users SET email_verify_code = NULL WHERE email_verify_code IS NOT NULL;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'email_verify_code_expires';
