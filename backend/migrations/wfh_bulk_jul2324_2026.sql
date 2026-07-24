-- ══════════════════════════════════════════════════════════════════════════════
-- WFH Bulk Insert — Jul 23–24, 2026 (Heavy Rain, Company-Wide)
-- Run: docker compose cp backend/migrations/wfh_bulk_jul2324_2026.sql postgres:/tmp/wfh_bulk_jul2324_2026.sql
--      docker compose exec postgres psql -U lumos_admin -d lumos_hrms -f /tmp/wfh_bulk_jul2324_2026.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- ── STEP 0: Show all orgs so we can confirm the right one ────────────────────
SELECT id, name, domain, slug FROM organizations ORDER BY id;

BEGIN;

-- ── STEP 1: Insert approved WFH leaves for all users (skip duplicates) ────────
-- Uses the first non-platform org found (adjust WHERE if needed)
WITH
  org AS (
    SELECT id FROM organizations ORDER BY id LIMIT 1
  ),
  approver AS (
    SELECT u.id
    FROM users u
    JOIN org ON u.organization_id = org.id
    WHERE u.role IN ('root_admin', 'admin')
    ORDER BY CASE u.role WHEN 'root_admin' THEN 0 ELSE 1 END
    LIMIT 1
  ),
  inserted AS (
    INSERT INTO leaves (
      user_id,
      organization_id,
      leave_type,
      start_date,
      end_date,
      status,
      reason,
      reviewed_by,
      reviewed_at,
      created_at,
      half_day
    )
    SELECT
      u.id,
      org.id,
      'wfh',
      '2026-07-23',
      '2026-07-24',
      'approved',
      'Company-wide WFH — heavy rain on Jul 23-24, 2026 (official)',
      (SELECT id FROM approver),
      NOW(),
      NOW(),
      false
    FROM users u
    JOIN org ON u.organization_id = org.id
    WHERE u.role NOT IN ('platform_admin')
      AND NOT EXISTS (
        SELECT 1 FROM leaves ex
        WHERE ex.user_id    = u.id
          AND ex.leave_type = 'wfh'
          AND ex.start_date <= '2026-07-24'
          AND ex.end_date   >= '2026-07-23'
      )
    RETURNING user_id
  )
SELECT COUNT(*) AS leaves_inserted FROM inserted;

-- ── STEP 2: Sync existing attendance rows to wfh status ──────────────────────
UPDATE attendance a
SET    status = 'wfh'
FROM   organizations o
WHERE  a.organization_id = o.id
  AND  o.id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
  AND  a.date IN ('2026-07-23', '2026-07-24')
  AND  a.status <> 'wfh';

-- ── STEP 3: Verify — show inserted records ───────────────────────────────────
SELECT
  u.name,
  u.role,
  l.leave_type,
  l.start_date,
  l.end_date,
  l.status
FROM   leaves l
JOIN   users u         ON u.id = l.user_id
JOIN   organizations o ON o.id = l.organization_id
WHERE  o.id         = (SELECT id FROM organizations ORDER BY id LIMIT 1)
  AND  l.leave_type = 'wfh'
  AND  l.start_date = '2026-07-23'
ORDER  BY u.name;

COMMIT;
