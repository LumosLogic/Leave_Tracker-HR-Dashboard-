-- ============================================================
-- Jignesh Pandya (674) — Approved CL for Aug 27–31 2026
-- Scope  : org_id = 1 (Relitrade)
-- Reason : Biometric did not capture attendance for Aug 27 (Thu),
--          Aug 28 (Fri), Aug 29 (Sat), Aug 31 (Mon).
--          HR confirmed employee was present — approved CL applied
--          as the coverage mechanism per HR instruction.
-- Effect : Engine picks up leave on dates with no attendance record
--          via: (!status || status==='absent') && leave → paidLeave
-- Safe   : NOT EXISTS guard — idempotent on re-run.
-- ============================================================

BEGIN;

-- GUARD: confirm employee exists before inserting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE organization_id = 1 AND employee_id = '674'
  ) THEN
    RAISE EXCEPTION 'Employee 674 not found in org 1 — aborting.';
  END IF;
END;
$$;

-- Insert single approved CL spanning Aug 27–31.
-- Engine buildLeaveDateMap covers all dates in range.
-- Aug 30 (Sunday) is weekoff — engine skips it before checking leave.
-- Aug 27, 28, 29 (Sat Shift), 31 are working days → classified as paidLeave.
WITH emp AS (
  SELECT id FROM users WHERE organization_id = 1 AND employee_id = '674'
),
approver AS (
  SELECT id FROM users
  WHERE organization_id = 1 AND role IN ('root_admin', 'admin')
  ORDER BY id LIMIT 1
)
INSERT INTO leaves (
  user_id, organization_id,
  start_date, end_date,
  leave_type, leave_time, half_type,
  reason, status,
  approved_by, approved_at,
  dept_head_status, root_admin_status
)
SELECT
  emp.id, 1,
  '2026-08-27', '2026-08-31',
  'casual', 'full', NULL,
  'CL approved by HR — Aug 27–31 (biometric not captured)',
  'approved',
  approver.id, NOW(),
  'approved', 'approved'
FROM emp, approver
WHERE NOT EXISTS (
  SELECT 1 FROM leaves l2
  WHERE l2.user_id   = emp.id
    AND l2.organization_id = 1
    AND l2.status    IN ('approved', 'pending', 'pending_approval', 'pending_dept', 'pending_root')
    AND l2.deleted_at IS NULL
    AND l2.start_date <= '2026-08-31'
    AND l2.end_date   >= '2026-08-27'
);

COMMIT;

-- ── Verification ─────────────────────────────────────────────
SELECT l.id, l.start_date, l.end_date, l.leave_type,
       l.leave_time, l.status, l.reason,
       u.name AS employee
FROM leaves l
JOIN users u ON u.id = l.user_id
WHERE l.organization_id = 1
  AND u.employee_id = '674'
  AND l.start_date >= '2026-08-01'
  AND l.status = 'approved'
ORDER BY l.start_date;
