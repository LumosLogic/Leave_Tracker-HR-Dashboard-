-- Migration: Centralize email service
-- Removes per-organization SMTP configuration columns from the organizations table.
-- All email is now sent via the platform-level SMTP credentials in environment variables.
-- Safe to run multiple times (IF EXISTS guards on all drops).

ALTER TABLE organizations DROP COLUMN IF EXISTS smtp_host;
ALTER TABLE organizations DROP COLUMN IF EXISTS smtp_port;
ALTER TABLE organizations DROP COLUMN IF EXISTS smtp_user;
ALTER TABLE organizations DROP COLUMN IF EXISTS smtp_pass;
ALTER TABLE organizations DROP COLUMN IF EXISTS smtp_from;

-- Verify columns are gone
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name LIKE 'smtp_%';
-- Expected: (0 rows)
