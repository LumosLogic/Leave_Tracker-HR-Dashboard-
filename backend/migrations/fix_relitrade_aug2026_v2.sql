-- ============================================================
-- Relitrade (org_id=1) — August 2026 Payroll Corrections v2
-- Replaces fix_relitrade_aug2026_payroll_data.sql (which rolled back)
-- Each section is its own transaction so one failure doesn't block others.
-- Run sections in order. Read NOTICE messages after each section.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- SECTION 1: BHAVYA BHAVSAR (user_id=59, employee_id=806)
-- Problem: sal_id=29 (active for Aug: Aug 24–Sep 2) has employee_esi=443.
--          Correct ESI = 0.75% × 15,000 = 113.
-- Effect:  deductions drop from 643 → 313, net: 14,357 → 14,687
-- ══════════════════════════════════════════════════════════════
BEGIN;
UPDATE employee_salary_structures
   SET employee_esi = 113
 WHERE id = 29
   AND organization_id = 1
   AND user_id = 59;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM employee_salary_structures
    WHERE id=29 AND organization_id=1 AND employee_esi=113
  ) THEN RAISE EXCEPTION 'Bhavya ESI fix failed'; END IF;
  RAISE NOTICE 'Bhavya: sal_id=29 ESI corrected to 113';
END; $$;
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 2: BHAVNA PAREKH (user_id=57, employee_id=802)
-- Problem A: sal_id=5 (active for Aug: Aug 18–Sep 2) has gross=15,103.
--            Correct gross = 15,000. Components need correction.
-- Problem B: LOP=0.5 — one leave in August is marked unpaid. Update to paid CL.
-- Effect:    gross 15,103→15,000, LOP 0.5→0, net: 13,640→14,687
-- ══════════════════════════════════════════════════════════════
BEGIN;

-- 2a. Fix sal_id=5 salary components to gross=15,000, no retention
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

RAISE NOTICE 'Bhavna: sal_id=5 components corrected to gross=15,000';

-- 2b. Fix any unpaid leave in August → paid CL so LOP becomes 0
-- Finds leaves where the policy marks it unpaid; updates the leave_type
-- to 'casual' (paid) so the engine classifies it as paidLeave.
UPDATE leaves
   SET leave_type        = 'casual',
       approved_by       = COALESCE(approved_by,
                             (SELECT id FROM users
                              WHERE organization_id=1
                                AND role IN ('root_admin','admin')
                              ORDER BY id LIMIT 1)),
       approved_at       = COALESCE(approved_at, NOW()),
       status            = 'approved',
       dept_head_status  = 'approved',
       root_admin_status = 'approved'
 WHERE user_id = 57
   AND organization_id = 1
   AND start_date >= '2026-08-01'
   AND end_date   <= '2026-08-31'
   AND deleted_at IS NULL
   AND leave_type NOT IN ('casual','cl','sick','sl','earned','el');

-- If there's no leave record causing the 0.5 LOP, find the half_day attendance
-- record (Aug 1, Saturday Shift) — HR says full present, so update it.
UPDATE attendance
   SET status = 'present'
 WHERE user_id = 57
   AND organization_id = 1
   AND date::date = '2026-08-01'
   AND status = 'half_day'
   AND COALESCE(work_hours, 0) >= 3;

RAISE NOTICE 'Bhavna: Aug leave type updated + Aug 1 attendance corrected if applicable';
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 3: JIGNESH PANDYA (employee_id=674)
-- Problem: LOP=0.5 → deduction=2,619.36. Expected LOP=0, net=149,800.
--          Cause: likely a half_day attendance record in August.
--          Also verify: no retention in salary structure.
-- ══════════════════════════════════════════════════════════════
BEGIN;

-- 3a. Fix any half_day attendance in August → present (if work_hours ≥ full_day threshold)
--     Saturday Shift full_day_hours=3; use 3 as threshold.
UPDATE attendance a
   SET status = 'present'
  FROM users u
 WHERE u.id             = a.user_id
   AND u.employee_id    = '674'
   AND a.organization_id = 1
   AND a.date >= '2026-08-01' AND a.date <= '2026-08-31'
   AND a.status = 'half_day'
   AND COALESCE(a.work_hours, 0) >= 3;

-- 3b. Remove retention from Jignesh's salary structure (if present)
UPDATE employee_salary_structures ess
   SET retention = 0
  FROM users u
 WHERE u.id              = ess.user_id
   AND u.employee_id     = '674'
   AND ess.organization_id = 1
   AND ess.effective_to IS NULL
   AND COALESCE(ess.retention, 0) > 0;

RAISE NOTICE 'Jignesh: half_day attendance corrected + retention cleared';
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 4: VISHAL SOLANKI (user_id=50)
-- Fix Aug 1 attendance half_day → present (work_hours=3.93 ≥ full_day_hours=3)
-- Effect: LOP 3.5 → 3 days, net: 13,106 → 13,348
-- Note: HR expected 12,433 but engine gives 13,348. Discrepancy = 915.
--       Do not force the value. Report separately.
-- ══════════════════════════════════════════════════════════════
BEGIN;
UPDATE attendance
   SET status = 'present'
 WHERE user_id = 50
   AND organization_id = 1
   AND date::date = '2026-08-01'
   AND status = 'half_day'
   AND COALESCE(work_hours, 0) >= 3;

DO $$ DECLARE v TEXT; BEGIN
  SELECT status INTO v FROM attendance
  WHERE user_id=50 AND organization_id=1 AND date::date='2026-08-01';
  IF v = 'present' THEN
    RAISE NOTICE 'Vishal Aug 1: corrected to present. LOP will be 3. Net = ~13,348. Discrepancy from HR expected 12,433 = 915.';
  ELSE
    RAISE NOTICE 'Vishal Aug 1 status = %. No change made (work_hours < 3 or record not found).', v;
  END IF;
END; $$;
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 5: ZARNA SUTHAR — approved CL for Aug 25–28 and Aug 31
-- HR confirmed these 5 days are approved paid leave.
-- Aug 29 (Sat), Aug 30 (Sun) = off days for Zarna.
-- ══════════════════════════════════════════════════════════════
BEGIN;

WITH zarna AS (
  SELECT id FROM users WHERE organization_id=1 AND name ILIKE '%zarna%suthar%' LIMIT 1
),
approver AS (
  SELECT id FROM users WHERE organization_id=1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1
)
INSERT INTO leaves (
  user_id, organization_id, start_date, end_date,
  leave_type, leave_time, half_type, reason, status,
  approved_by, approved_at, dept_head_status, root_admin_status
)
SELECT z.id, 1, d.dt, d.dt,
       'casual', 'full', NULL,
       'CL — HR confirmed manual record Aug 2026',
       'approved',
       a.id, NOW(), 'approved', 'approved'
FROM zarna z, approver a,
     (VALUES ('2026-08-25'::date),('2026-08-26'),('2026-08-27'),
             ('2026-08-28'),('2026-08-31')) AS d(dt)
WHERE NOT EXISTS (
  SELECT 1 FROM leaves l
  WHERE l.user_id = z.id AND l.organization_id=1
    AND l.status IN ('approved','pending','pending_approval','pending_dept','pending_root')
    AND l.deleted_at IS NULL
    AND l.start_date::date = d.dt AND l.end_date::date = d.dt
);

RAISE NOTICE 'Zarna: CL inserted for Aug 25-28 and 31 (skipped if already exists)';
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 6: SATURDAY WEEKOFF — Jaydip Patel, Zarna Suthar, Mukesh Thakor
-- These employees should have all Saturdays as off.
-- Mechanism: assign the Weekday Shift (days_of_week=[1,2,3,4,5]) on each
-- Saturday in August. Engine sees Saturday DOW=6 not in shift's workDays
-- → effectiveIsWeekend=true → weekoff (excluded from LOP + denominator).
-- ══════════════════════════════════════════════════════════════
BEGIN;

-- Find Weekday Shift id
DO $$ DECLARE wds_id INT;
BEGIN
  SELECT id INTO wds_id FROM shifts
  WHERE organization_id=1 AND name ILIKE '%weekday%'
  ORDER BY id LIMIT 1;

  IF wds_id IS NULL THEN
    RAISE EXCEPTION 'Weekday Shift not found for org 1';
  END IF;

  -- Insert Saturday Shift-weekoff assignments for Jaydip, Zarna, Mukesh
  -- For each employee and each Saturday in August 2026
  INSERT INTO shift_assignments (user_id, shift_id, organization_id, date, days_of_week)
  SELECT u.id, wds_id, 1, d.dt, NULL
  FROM (
    SELECT id FROM users
    WHERE organization_id=1
      AND name ILIKE ANY(ARRAY['%jaydip%patel%','%zarna%suthar%','%mukesh%thakor%'])
  ) u,
  (VALUES ('2026-08-01'::date),('2026-08-08'),('2026-08-15'),
          ('2026-08-22'),('2026-08-29')) AS d(dt)
  WHERE NOT EXISTS (
    SELECT 1 FROM shift_assignments sa2
    WHERE sa2.user_id=u.id AND sa2.organization_id=1 AND sa2.date::date=d.dt
  );

  RAISE NOTICE 'Jaydip/Zarna/Mukesh: Weekday Shift assigned on Aug Saturdays (shift_id=%)', wds_id;
END; $$;
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 7: FUTURE HOLIDAYS (Sep–Dec 2026)
-- HR-confirmed holiday calendar for Relitrade (org_id=1)
-- ══════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO holidays (organization_id, date, name)
VALUES
  (1, '2026-09-14', 'Ganesh Chaturthi'),
  (1, '2026-10-02', 'Gandhi Jayanti'),
  (1, '2026-10-20', 'Dussehra'),
  (1, '2026-11-10', 'Bhaiduj'),
  (1, '2026-11-24', 'Nanak Jayanti'),
  (1, '2026-12-25', 'Christmas')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Holidays added for Sep–Dec 2026';
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 8: MANISH KANDEL — unlock regularization
-- HR cannot submit regularizations because payslip may be locked.
-- Unlock any locked payslip for Aug 2026 to allow corrections,
-- but only if payroll run is not yet in 'approved' or 'paid' state.
-- ══════════════════════════════════════════════════════════════
BEGIN;

UPDATE payslips ps
   SET locked = false
  FROM users u
 WHERE u.id                = ps.user_id
   AND u.organization_id   = 1
   AND u.name              ILIKE '%manish%kandel%'
   AND ps.month            = '08'
   AND ps.year             = 2026
   AND ps.locked           = true
   AND NOT EXISTS (
     SELECT 1 FROM payroll_runs pr
     WHERE pr.id = ps.payroll_run_id
       AND pr.status IN ('approved','paid','locked')
   );

RAISE NOTICE 'Manish Kandel: payslip unlocked if it existed and run was not approved/paid';
COMMIT;


-- ══════════════════════════════════════════════════════════════
-- VERIFICATION — run after all sections
-- ══════════════════════════════════════════════════════════════
SELECT 'Bhavya sal_id=29' AS check_item,
       employee_esi, gross_salary, effective_from::text
  FROM employee_salary_structures WHERE id=29 AND organization_id=1;

SELECT 'Bhavna sal_id=5' AS check_item,
       employee_esi, gross_salary, retention, effective_from::text
  FROM employee_salary_structures WHERE id=5 AND organization_id=1;

SELECT 'Vishal Aug 1 attendance' AS check_item, status, work_hours
  FROM attendance
 WHERE user_id=50 AND organization_id=1 AND date::date='2026-08-01';

SELECT 'Zarna Aug leaves' AS check_item,
       l.start_date::text, l.leave_type, l.status
  FROM leaves l JOIN users u ON u.id=l.user_id
 WHERE u.organization_id=1 AND u.name ILIKE '%zarna%'
   AND l.start_date >= '2026-08-25' AND l.status='approved'
 ORDER BY l.start_date;

SELECT 'Holidays added' AS check_item, date::text, name
  FROM holidays
 WHERE organization_id=1 AND date >= '2026-09-01'
 ORDER BY date;
