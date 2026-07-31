-- Phase F: Technical Debt Cleanup
--
-- 1. Drop attendance.clockify_hours — Clockify was removed 2026-07-22; column is dead weight
--    on a high-write table. No backend code reads it. Safe to drop.
--
-- 2. Backfill users.designation_id — employees created via the old free-text form never had
--    designation_id set. This UPDATE matches position text → designation name (case-insensitive,
--    trimmed) within the same org and fills the FK. Only updates rows where designation_id IS
--    NULL to avoid overwriting intentional assignments.
--
-- Safe to re-run: DROP COLUMN IF EXISTS; UPDATE only touches null rows.
-- Run: psql -U lumos_admin -d lumos_hrms -f phase_f_cleanup.sql

BEGIN;

-- ─── 1. Remove clockify_hours from attendance ─────────────────────────────────

ALTER TABLE attendance DROP COLUMN IF EXISTS clockify_hours;

-- ─── 2. Backfill designation_id for employees whose position text matches ─────

UPDATE users u
SET    designation_id = d.id
FROM   designations d
WHERE  d.organization_id = u.organization_id
  AND  LOWER(TRIM(d.name)) = LOWER(TRIM(u.position))
  AND  u.designation_id IS NULL
  AND  u.position IS NOT NULL
  AND  u.position <> '';

-- Verify: show how many rows were updated (informational — returns count of still-null rows)
SELECT COUNT(*) AS employees_still_without_designation_id
FROM users
WHERE role = 'employee'
  AND designation_id IS NULL
  AND position IS NOT NULL
  AND position <> '';

-- ─── Record migration ──────────────────────────────────────────────────────────

INSERT INTO schema_migrations(version, description)
VALUES ('20260731_phase_f_cleanup', 'Drop attendance.clockify_hours; backfill users.designation_id from position text')
ON CONFLICT (version) DO NOTHING;

COMMIT;
