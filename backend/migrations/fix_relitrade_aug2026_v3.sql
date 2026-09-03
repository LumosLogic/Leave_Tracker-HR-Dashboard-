-- ============================================================
-- Relitrade (org_id=1) — August 2026 Payroll Corrections v3
-- Fixes remaining issues from v2 (sections that rolled back).
-- All RAISE NOTICE wrapped in DO blocks. days_of_week removed
-- from shift_assignments INSERT (column is on shifts table only).
-- Run after v2 has been executed.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- SECTION 1: BHAVNA PAREKH (user_id=57, sal_id=5)
-- sal_id=5 still has gross=15,103. Fix to 15,000 + LOP=0.
-- ══════════════════════════════════════════════════════════════
BEGIN;

UPDATE employee_salary_structures
   SET basic               = 7500,
       hra                 = 3000,
       da                  = 750,
       transport_allowance = 0,
       medical_allowance   = 1250,
       special_allowance   = 2500,
       other_allowance     = 0,
       gross_salary        = 15000.00,
       employee_esi        = 113,
       professional_tax    = 200,
       retention           = 0,
       other_deductions    = 0,
       ctc                 = 15488.00
 WHERE id = 5
   AND organization_id = 1
   AND user_id = 57;

-- Fix any unpaid leave in August → casual (paid)
UPDATE leaves
   SET leave_type        = 'casual',
       status            = 'approved',
       dept_head_status  = 'approved',
       root_admin_status = 'approved',
       approved_by       = COALESCE(approved_by,
                             (SELECT id FROM users
                              WHERE organization_id=1
                                AND role IN ('root_admin','admin')
                              ORDER BY id LIMIT 1)),
       approved_at = COALESCE(approved_at, NOW())
 WHERE user_id = 57
   AND organization_id = 1
   AND start_date >= '2026-08-01'
   AND end_date   <= '2026-08-31'
   AND deleted_at IS NULL
   AND leave_type NOT IN ('casual','cl','sick','sl','earned','el','annual');

-- Fix Aug 1 half_day → present if work_hours qualifies
UPDATE attendance
   SET status = 'present'
 WHERE user_id = 57
   AND organization_id = 1
   AND date::date = '2026-08-01'
   AND status = 'half_day'
   AND COALESCE(work_hours, 0) >= 3;

COMMIT;

DO $$ DECLARE g NUMERIC; BEGIN
  SELECT gross_salary INTO g FROM employee_salary_structures WHERE id=5 AND organization_id=1;
  IF g = 15000 THEN
    RAISE NOTICE 'Bhavna sal_id=5: gross corrected to 15,000';
  ELSE
    RAISE WARNING 'Bhavna sal_id=5: gross still %. Check permissions.', g;
  END IF;
END; $$;


-- ══════════════════════════════════════════════════════════════
-- SECTION 2: JIGNESH PANDYA (employee_id=674)
-- Fix the half_day attendance causing 0.5 LOP → correct to present.
-- ══════════════════════════════════════════════════════════════
BEGIN;

UPDATE attendance a
   SET status = 'present'
  FROM users u
 WHERE u.id              = a.user_id
   AND u.employee_id     = '674'
   AND a.organization_id = 1
   AND a.date >= '2026-08-01' AND a.date <= '2026-08-31'
   AND a.status = 'half_day'
   AND COALESCE(a.work_hours, 0) >= 3;

-- Also remove retention from salary if present
UPDATE employee_salary_structures ess
   SET retention = 0
  FROM users u
 WHERE u.id               = ess.user_id
   AND u.employee_id      = '674'
   AND ess.organization_id = 1
   AND ess.effective_to IS NULL
   AND COALESCE(ess.retention, 0) > 0;

COMMIT;

DO $$ DECLARE cnt INT; BEGIN
  SELECT COUNT(*) INTO cnt
    FROM attendance a
    JOIN users u ON u.id = a.user_id
   WHERE u.employee_id = '674'
     AND a.organization_id = 1
     AND a.date >= '2026-08-01' AND a.date <= '2026-08-31'
     AND a.status = 'half_day';
  IF cnt = 0 THEN
    RAISE NOTICE 'Jignesh: no half_day records remain in August. LOP should be 0.';
  ELSE
    RAISE WARNING 'Jignesh: % half_day record(s) still present in August.', cnt;
  END IF;
END; $$;


-- ══════════════════════════════════════════════════════════════
-- SECTION 3: ZARNA SUTHAR — Add missing Aug 26, 27, 28 CL
-- Aug 25 and Aug 31 already exist from v2. Add the remaining 3.
-- ══════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO leaves (
  user_id, organization_id, start_date, end_date,
  leave_type, leave_time, half_type, reason, status,
  approved_by, approved_at, dept_head_status, root_admin_status
)
SELECT u.id, 1, d.dt, d.dt,
       'casual', 'full', NULL,
       'CL — HR confirmed manual record Aug 2026',
       'approved',
       (SELECT id FROM users WHERE organization_id=1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1),
       NOW(), 'approved', 'approved'
FROM (SELECT id FROM users WHERE organization_id=1 AND name ILIKE '%zarna%suthar%' LIMIT 1) u,
     (VALUES ('2026-08-26'::date), ('2026-08-27'), ('2026-08-28')) AS d(dt)
WHERE NOT EXISTS (
  SELECT 1 FROM leaves l
  WHERE l.user_id = u.id AND l.organization_id=1
    AND l.status IN ('approved','pending','pending_approval','pending_dept','pending_root')
    AND l.deleted_at IS NULL
    AND l.start_date::date = d.dt
);

COMMIT;

DO $$ DECLARE cnt INT; BEGIN
  SELECT COUNT(*) INTO cnt
    FROM leaves l JOIN users u ON u.id=l.user_id
   WHERE u.name ILIKE '%zarna%suthar%' AND l.organization_id=1
     AND l.status='approved' AND l.start_date >= '2026-08-25' AND l.end_date <= '2026-08-31';
  RAISE NOTICE 'Zarna: % approved CL records for Aug 25–31 (expect 5)', cnt;
END; $$;


-- ══════════════════════════════════════════════════════════════
-- SECTION 4: SATURDAY WEEKOFF — Jaydip, Zarna, Mukesh
-- Assign the Weekday Shift (days_of_week=[1,2,3,4,5]) on each
-- Saturday in August for these 3 employees.
-- Engine: DOW=6 not in {1,2,3,4,5} → effectiveIsWeekend=true → weekoff.
-- shift_assignments has no days_of_week column — use (user_id, shift_id, org, date) only.
-- ══════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  wds_id   INT;
  emp      RECORD;
  sat_date DATE;
BEGIN
  -- Get Weekday Shift id
  SELECT id INTO wds_id
    FROM shifts
   WHERE organization_id=1
     AND name ILIKE '%weekday%'
   ORDER BY id LIMIT 1;

  IF wds_id IS NULL THEN
    RAISE EXCEPTION 'Weekday Shift not found in org 1';
  END IF;

  RAISE NOTICE 'Using Weekday Shift id=%', wds_id;

  -- For each target employee
  FOR emp IN
    SELECT id, name FROM users
    WHERE organization_id=1
      AND (name ILIKE '%jaydip%patel%'
        OR name ILIKE '%zarna%suthar%'
        OR name ILIKE '%mukesh%thakor%')
  LOOP
    -- Assign Weekday Shift on each Saturday of August 2026
    FOR sat_date IN
      SELECT d::date
        FROM generate_series('2026-08-01'::date, '2026-08-29'::date, '7 days') d
    LOOP
      -- Only insert if no shift already assigned for this date
      IF NOT EXISTS (
        SELECT 1 FROM shift_assignments
        WHERE user_id=emp.id AND organization_id=1 AND date::date=sat_date
      ) THEN
        INSERT INTO shift_assignments (user_id, shift_id, organization_id, date)
        VALUES (emp.id, wds_id, 1, sat_date);
        RAISE NOTICE 'Assigned Weekday Shift to % on %', emp.name, sat_date;
      ELSE
        RAISE NOTICE 'Shift already assigned for % on % — skipping', emp.name, sat_date;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 5: MANISH KANDEL — unlock regularization
-- ══════════════════════════════════════════════════════════════
BEGIN;

UPDATE payslips ps
   SET locked = false
  FROM users u
 WHERE u.id              = ps.user_id
   AND u.organization_id = 1
   AND u.name ILIKE '%manish%kandel%'
   AND ps.month          = '08'
   AND ps.year           = 2026
   AND ps.locked         = true
   AND NOT EXISTS (
     SELECT 1 FROM payroll_runs pr
     WHERE pr.id = ps.payroll_run_id
       AND pr.status IN ('approved','paid')
   );

COMMIT;

DO $$ DECLARE cnt INT; BEGIN
  SELECT COUNT(*) INTO cnt
    FROM payslips ps JOIN users u ON u.id=ps.user_id
   WHERE u.name ILIKE '%manish%kandel%' AND ps.month='08' AND ps.year=2026 AND ps.locked=true;
  IF cnt = 0 THEN
    RAISE NOTICE 'Manish: no locked payslips remain for Aug 2026';
  ELSE
    RAISE NOTICE 'Manish: % payslip(s) still locked (may be in approved/paid run)', cnt;
  END IF;
END; $$;


-- ══════════════════════════════════════════════════════════════
-- FINAL VERIFICATION
-- ══════════════════════════════════════════════════════════════
SELECT 'Bhavna sal_id=5' AS check_item,
       gross_salary, employee_esi, retention, effective_from::text
  FROM employee_salary_structures WHERE id=5 AND organization_id=1;

SELECT 'Jignesh half_day in Aug' AS check_item, COUNT(*) AS remaining_half_days
  FROM attendance a JOIN users u ON u.id=a.user_id
 WHERE u.employee_id='674' AND a.organization_id=1
   AND a.date BETWEEN '2026-08-01' AND '2026-08-31' AND a.status='half_day';

SELECT 'Zarna CL Aug 25-31' AS check_item,
       l.start_date::text, l.leave_type, l.status
  FROM leaves l JOIN users u ON u.id=l.user_id
 WHERE u.name ILIKE '%zarna%' AND l.organization_id=1
   AND l.start_date >= '2026-08-25' AND l.status='approved'
 ORDER BY l.start_date;

SELECT 'Saturday shift assignments' AS check_item,
       u.name, sa.date::text, s.name AS shift
  FROM shift_assignments sa
  JOIN users u ON u.id=sa.user_id
  JOIN shifts s ON s.id=sa.shift_id
 WHERE u.organization_id=1
   AND (u.name ILIKE '%jaydip%' OR u.name ILIKE '%zarna%' OR u.name ILIKE '%mukesh%thakor%')
   AND sa.date BETWEEN '2026-08-01' AND '2026-08-29'
   AND EXTRACT(DOW FROM sa.date) = 6
 ORDER BY u.name, sa.date;
