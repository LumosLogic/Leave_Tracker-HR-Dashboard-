-- ============================================================
-- Bhavna + Priyanshi — Aug 15 Holiday Attendance Record
-- Scope  : org_id = 1 (Relitrade)
-- Date   : 2026-09-03
-- Reason : Both employees have no attendance record for Aug 15
--          (Independence Day). The payroll engine credits holidays
--          from the holidays table regardless of attendance records,
--          but inserting explicit records ensures consistency with
--          biometric data and prevents engine edge cases.
-- Safe   : ON CONFLICT DO NOTHING — idempotent.
-- ============================================================

BEGIN;

INSERT INTO attendance (user_id, organization_id, date, status, work_hours)
SELECT u.id, 1, '2026-08-15', 'present', 3
FROM users u
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('802', '805')
ON CONFLICT (user_id, date) DO NOTHING;

COMMIT;

-- Verification
SELECT u.device_enrollment_id AS pin, u.name, a.date, a.status, a.work_hours
FROM attendance a JOIN users u ON u.id = a.user_id
WHERE a.organization_id = 1
  AND u.device_enrollment_id IN ('802','805')
  AND a.date = '2026-08-15';
