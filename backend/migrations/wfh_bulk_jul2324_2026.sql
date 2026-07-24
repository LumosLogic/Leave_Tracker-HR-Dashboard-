-- ══════════════════════════════════════════════════════════════════════════════
-- WFH Bulk Insert — Jul 23–24, 2026 (Heavy Rain, Company-Wide)
-- Org: Lumos Logic India LLP  |  domain: lumoslogic.com
-- Run: psql -U lumos_admin -d lumos_hrms -f migrations/wfh_bulk_jul2324_2026.sql
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── STEP 1: Verify org exists ─────────────────────────────────────────────────
DO $$
DECLARE
  v_org_id INT;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE domain = 'lumoslogic.com' LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found for domain lumoslogic.com — aborting.';
  END IF;
  RAISE NOTICE 'Found org id=%', v_org_id;
END $$;

-- ── STEP 2: Insert approved WFH leaves for all users (skip duplicates) ────────
WITH
  org AS (
    SELECT id FROM organizations WHERE domain = 'lumoslogic.com' LIMIT 1
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
      'Company-wide WFH — heavy rain on Jul 23–24, 2026 (official)',
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

-- ── STEP 3: Sync existing attendance rows to wfh status ──────────────────────
UPDATE attendance a
SET    status = 'wfh'
FROM   organizations o
WHERE  a.organization_id = o.id
  AND  o.domain          = 'lumoslogic.com'
  AND  a.date            IN ('2026-07-23', '2026-07-24')
  AND  a.status          <> 'wfh';

GET DIAGNOSTICS;

-- ── STEP 4: Verify ───────────────────────────────────────────────────────────
SELECT
  u.name,
  u.role,
  l.leave_type,
  l.start_date,
  l.end_date,
  l.status,
  l.reason
FROM   leaves l
JOIN   users u         ON u.id  = l.user_id
JOIN   organizations o ON o.id  = l.organization_id
WHERE  o.domain        = 'lumoslogic.com'
  AND  l.leave_type    = 'wfh'
  AND  l.start_date    = '2026-07-23'
ORDER  BY u.name;

COMMIT;
