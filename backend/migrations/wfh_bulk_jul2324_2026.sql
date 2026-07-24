-- ══════════════════════════════════════════════════════════════════════════════
-- WFH Bulk Insert — Jul 23–24, 2026 (Heavy Rain, Company-Wide)
-- Org: LumosLogic (id = 2)
-- Run: docker compose cp backend/migrations/wfh_bulk_jul2324_2026.sql postgres:/tmp/wfh_bulk_jul2324_2026.sql
--      docker compose exec postgres psql -U lumos_admin -d lumos_hrms -f /tmp/wfh_bulk_jul2324_2026.sql
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Insert approved WFH for all LumosLogic users (skip if overlapping WFH exists)
WITH inserted AS (
  INSERT INTO leaves (
    user_id,
    organization_id,
    leave_type,
    leave_time,
    start_date,
    end_date,
    status,
    reason,
    approved_by,
    approved_at,
    created_at
  )
  SELECT
    u.id,
    2,
    'wfh',
    'wfh',
    '2026-07-23',
    '2026-07-24',
    'approved',
    'Company-wide WFH — heavy rain on Jul 23-24, 2026 (official)',
    (SELECT id FROM users WHERE organization_id = 2 AND role = 'root_admin' LIMIT 1),
    NOW(),
    NOW()
  FROM users u
  WHERE u.organization_id = 2
    AND NOT EXISTS (
      SELECT 1 FROM leaves ex
      WHERE ex.user_id        = u.id
        AND (ex.leave_type = 'wfh' OR ex.leave_time = 'wfh')
        AND ex.start_date  <= '2026-07-24'
        AND ex.end_date    >= '2026-07-23'
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

-- Verify — show all inserted records
SELECT u.name, l.leave_type, l.leave_time, l.start_date, l.end_date, l.status
FROM   leaves l
JOIN   users u ON u.id = l.user_id
WHERE  l.organization_id = 2
  AND  l.leave_type      = 'wfh'
  AND  l.start_date      = '2026-07-23'
ORDER  BY u.name;

COMMIT;
