-- ============================================================
-- Relitrade (org_id=1) — August 2026 Payroll Data Corrections
-- Scope   : salary structures, attendance, leave records
-- Reason  : HR-confirmed corrections before August payroll generation
-- Safe    : idempotent guards on all writes; never touches payslips
-- Run BEFORE payroll generation for August 2026.
-- ============================================================

BEGIN;

-- ── 0. Helpers ────────────────────────────────────────────────────────────────
-- Resolve approver for inserted leave records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin')
  ) THEN
    RAISE EXCEPTION 'No admin found in org 1 — aborting.';
  END IF;
END; $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BHAVYA BHAVSAR (employee_id=806, user_id=59)
--    Problem A: salary_id=39 effective_from=2026-09-03 — after August, so engine
--               cannot find a salary for August payroll → SALARY_NOT_FOUND.
--    Problem B: employee_esi=313 is wrong; should be 0.75% × 15,000 = ₹113.
--    Fix: backdate salary_id=39 to 2026-08-01 and correct ESI.
--    Also: the POST that created salary_id=39 set the prior record's effective_to
--          to 2026-09-02. Bring that forward to 2026-07-31 so August is covered
--          by salary_id=39 without gaps.
-- ─────────────────────────────────────────────────────────────────────────────

-- Close any prior salary record at 2026-07-31 (was closed at 2026-09-02)
UPDATE employee_salary_structures
   SET effective_to = '2026-07-31'
 WHERE organization_id = 1
   AND user_id = 59
   AND effective_to::date = '2026-09-02';  -- set when salary_id=39 was created

-- Backdate salary_id=39 to Aug 1 and correct ESI
UPDATE employee_salary_structures
   SET effective_from  = '2026-08-01',
       employee_esi    = 113
 WHERE id             = 39
   AND organization_id = 1
   AND effective_to IS NULL;

-- Verify
DO $$ DECLARE r RECORD; BEGIN
  SELECT effective_from, employee_esi INTO r
    FROM employee_salary_structures
   WHERE id = 39 AND organization_id = 1;
  IF r.effective_from::date != '2026-08-01' THEN
    RAISE EXCEPTION 'Bhavya salary backdate failed. effective_from=%', r.effective_from;
  END IF;
  IF r.employee_esi != 113 THEN
    RAISE EXCEPTION 'Bhavya ESI fix failed. employee_esi=%', r.employee_esi;
  END IF;
END; $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BHAVNA PAREKH (employee_id=802, user_id=57)
--    Problem: salary_id=40 effective_from=2026-09-04 — after August.
--    HR confirmed Bhavna is full present in August; ESI=113 is already correct.
--    Fix: backdate salary_id=40 to 2026-08-01.
-- ─────────────────────────────────────────────────────────────────────────────

-- Close any prior salary record at 2026-07-31
UPDATE employee_salary_structures
   SET effective_to = '2026-07-31'
 WHERE organization_id = 1
   AND user_id = 57
   AND effective_to::date = '2026-09-03';  -- set when salary_id=40 was created

-- Backdate salary_id=40 to Aug 1
UPDATE employee_salary_structures
   SET effective_from = '2026-08-01'
 WHERE id             = 40
   AND organization_id = 1
   AND effective_to IS NULL;

-- Verify
DO $$ DECLARE r RECORD; BEGIN
  SELECT effective_from INTO r
    FROM employee_salary_structures
   WHERE id = 40 AND organization_id = 1;
  IF r.effective_from::date != '2026-08-01' THEN
    RAISE EXCEPTION 'Bhavna salary backdate failed. effective_from=%', r.effective_from;
  END IF;
END; $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VISHAL SOLANKI (user_id=50) — approved leave for Aug 11, 12, 26
--    HR confirmed these 3 dates are approved leave from manual HR records.
--    Type: Casual Leave (paid). Engine picks these up via leaveDateMap:
--      (!status || status==='absent') && leave → paidLeave
--    Idempotent: NOT EXISTS guard prevents duplicate inserts.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO leaves (
  user_id, organization_id,
  start_date, end_date,
  leave_type, leave_time, half_type,
  reason, status,
  approved_by, approved_at,
  dept_head_status, root_admin_status
)
SELECT
  50, 1,
  d.dt, d.dt,
  'casual', 'full', NULL,
  'CL — manual HR record, no biometric/attendance captured',
  'approved',
  (SELECT id FROM users WHERE organization_id=1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1),
  NOW(),
  'approved', 'approved'
FROM (VALUES
  ('2026-08-11'::date),
  ('2026-08-12'::date),
  ('2026-08-26'::date)
) AS d(dt)
WHERE NOT EXISTS (
  SELECT 1 FROM leaves l2
  WHERE l2.user_id          = 50
    AND l2.organization_id  = 1
    AND l2.status           IN ('approved','pending','pending_approval','pending_dept','pending_root')
    AND l2.deleted_at IS NULL
    AND l2.start_date::date = d.dt
    AND l2.end_date::date   = d.dt
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. JIGNESH PANDYA (employee_id=674) — verify CL is in place
--    The leave was already inserted by fix_jignesh_aug_cl_2026_09_03.sql.
--    This is a read-only verification — no writes.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ DECLARE cnt INT; BEGIN
  SELECT COUNT(*) INTO cnt
    FROM leaves l
    JOIN users u ON u.id = l.user_id
   WHERE u.organization_id = 1
     AND u.employee_id     = '674'
     AND l.status          = 'approved'
     AND l.start_date::date = '2026-08-27'
     AND l.end_date::date   = '2026-08-31';
  IF cnt = 0 THEN
    RAISE EXCEPTION 'Jignesh CL for Aug 27–31 not found — run fix_jignesh_aug_cl_2026_09_03.sql first.';
  ELSE
    RAISE NOTICE 'Jignesh CL verified: % record(s) found.', cnt;
  END IF;
END; $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verify payroll settings — org 1 must have calendar_days basis
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ DECLARE v TEXT; BEGIN
  SELECT per_day_salary_basis INTO v
    FROM payroll_settings WHERE organization_id = 1;
  IF v IS DISTINCT FROM 'calendar_days' THEN
    RAISE EXCEPTION 'per_day_salary_basis is "%" for org 1 — run add_per_day_salary_basis.sql first.', v;
  ELSE
    RAISE NOTICE 'per_day_salary_basis = calendar_days confirmed for org 1.';
  END IF;
END; $$;

COMMIT;


-- ── Post-run verification ─────────────────────────────────────────────────────
SELECT 'Bhavya salary' AS check_item,
       s.effective_from::text, s.employee_esi, s.gross_salary
  FROM employee_salary_structures s
  JOIN users u ON u.id = s.user_id
 WHERE u.organization_id = 1 AND u.employee_id = '806'
   AND s.effective_to IS NULL;

SELECT 'Bhavna salary' AS check_item,
       s.effective_from::text, s.employee_esi, s.gross_salary
  FROM employee_salary_structures s
  JOIN users u ON u.id = s.user_id
 WHERE u.organization_id = 1 AND u.employee_id = '802'
   AND s.effective_to IS NULL;

SELECT 'Vishal leaves Aug' AS check_item,
       l.start_date::text, l.leave_type, l.status
  FROM leaves l
  JOIN users u ON u.id = l.user_id
 WHERE u.organization_id = 1 AND u.id = 50
   AND l.start_date >= '2026-08-01' AND l.end_date <= '2026-08-31'
   AND l.status = 'approved'
 ORDER BY l.start_date;
