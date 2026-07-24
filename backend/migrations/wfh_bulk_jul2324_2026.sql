-- ══════════════════════════════════════════════════════════════════════════════
-- WFH Bulk Insert — Jul 23–24, 2026 (Heavy Rain, Company-Wide)
-- Org: LumosLogic (id = 2)
-- Run: docker compose cp backend/migrations/wfh_bulk_jul2324_2026.sql postgres:/tmp/wfh_bulk_jul2324_2026.sql
--      docker compose exec postgres psql -U lumos_admin -d lumos_hrms -f /tmp/wfh_bulk_jul2324_2026.sql
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

WITH inserted AS (
  INSERT INTO leaves (
    user_id,
    organization_id,
    leave_type,
    start_date,
    end_date,
    status,
    reason,
    created_at,
    half_day
  )
  SELECT
    u.id,
    2,
    'wfh',
    '2026-07-23',
    '2026-07-24',
    'approved',
    'Company-wide WFH — heavy rain on Jul 23-24, 2026 (official)',
    NOW(),
    false
  FROM users u
  WHERE u.organization_id = 2
    AND u.role NOT IN ('platform_admin')
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

-- Sync any existing attendance rows for those dates to wfh
UPDATE attendance
SET    status = 'wfh'
WHERE  organization_id = 2
  AND  date IN ('2026-07-23', '2026-07-24')
  AND  status <> 'wfh';

-- Verify
SELECT u.name, u.role, l.leave_type, l.start_date, l.end_date, l.status
FROM   leaves l
JOIN   users u ON u.id = l.user_id
WHERE  l.organization_id = 2
  AND  l.leave_type      = 'wfh'
  AND  l.start_date      = '2026-07-23'
ORDER  BY u.name;

COMMIT;
