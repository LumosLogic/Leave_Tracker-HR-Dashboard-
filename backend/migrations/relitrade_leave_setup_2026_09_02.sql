-- ============================================================
-- Relitrade Leave Setup — Path B — 2026-09-02
-- Scope  : org_id = 1 (Relitrade Stock Broking Pvt Ltd)
-- DB     : lumos_hrms  (docker exec -i lumos_postgres psql ...)
-- Covers : 9 confirmed employees only.
--          Employees 801/805/808 are NOT in the DB — skipped.
-- Safe   : Fully transactional. Idempotent on re-run.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- GUARD: abort the whole transaction if any of the 9 confirmed
-- employees has somehow disappeared since the pre-check.
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  found_count INT;
BEGIN
  SELECT COUNT(*) INTO found_count
  FROM users
  WHERE organization_id = 1
    AND employee_id IN ('480','674','677','692','693','694','802','804','806');

  IF found_count <> 9 THEN
    RAISE EXCEPTION
      'ABORT: expected 9 employees, found %. Re-run the pre-check first.', found_count;
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 1. FINANCIAL YEAR — April–March
-- ─────────────────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS leave_year_start_month INT DEFAULT 1
    CHECK (leave_year_start_month BETWEEN 1 AND 12);

UPDATE organizations
SET    leave_year_start_month = 4
WHERE  id = 1;


-- ─────────────────────────────────────────────────────────────
-- 2. LEAVE POLICY — CL only, 20 days, paid
--    Deactivate non-CL types (preserves historical leave rows —
--    leaves.leave_type is plain TEXT, no FK constraint).
--    The payroll engine LEFT JOINs leave_policies with no
--    active filter, so deactivated rows still resolve correctly
--    for historical payroll runs.
-- ─────────────────────────────────────────────────────────────

UPDATE leave_policies
SET    active = false
WHERE  organization_id = 1
  AND  leave_type <> 'casual';

INSERT INTO leave_policies
  (organization_id, leave_type, label, annual_quota,
   carry_forward, max_carry_forward, paid, active)
VALUES
  (1, 'casual', 'Casual Leave', 20, false, 0, true, true)
ON CONFLICT (organization_id, leave_type) DO UPDATE
  SET annual_quota      = 20,
      label             = 'Casual Leave',
      paid              = true,
      carry_forward     = false,
      max_carry_forward = 0,
      active            = true;


-- ─────────────────────────────────────────────────────────────
-- 3. CL OPENING BALANCE IMPORT — 9 employees
--    FY 2026-27 window: 2026-04-01 → 2027-03-31  (year = 2026)
--
--    Formula: delta = target_balance − 20 + used_in_system
--    → guarantees remaining = 20 + delta − used = target_balance
--    even if approved CL leaves already exist in the DB.
--
--    Weekend approximation: Mon–Fri (DOW 1–5). Holidays not
--    excluded at import time; the live balance endpoint handles
--    holidays via buildWorkingDates() for ongoing calculations.
--
--    Employee 674 (Jignesh Pandya, target = 20):
--      delta = 20 − 20 + 0 = 0 → no row inserted (delta <> 0
--      constraint). Quota of 20 alone gives remaining = 20.
--
--    Employees 801 / 805 / 808: intentionally excluded.
-- ─────────────────────────────────────────────────────────────

-- Step A: remove any prior year-2026 CL adjustment rows for
-- these 9 employees so the import is idempotent on re-run.
DELETE FROM leave_balance_adjustments
WHERE  org_id     = 1
  AND  leave_type = 'casual'
  AND  year       = 2026
  AND  user_id IN (
         SELECT id FROM users
         WHERE  organization_id = 1
           AND  employee_id IN
                ('480','674','677','692','693','694','802','804','806')
       );

-- Step B: compute and insert.
WITH targets (emp_id, target_balance) AS (
  VALUES
    ('480',  0.0),
    ('674', 20.0),
    ('677', 18.0),
    ('692', 18.0),
    ('693', 18.0),
    ('694', 15.0),
    ('802',  7.5),
    ('804',  0.0),
    ('806',  0.0)
),
emp_lookup AS (
  SELECT u.id AS user_id, t.target_balance
  FROM   targets t
  JOIN   users u
         ON  u.organization_id = 1
         AND u.employee_id     = t.emp_id
),
used_cl AS (
  SELECT
    l.user_id,
    COALESCE(SUM(
      CASE l.leave_time
        WHEN 'half' THEN 0.5
        ELSE (
          SELECT COUNT(*)::numeric
          FROM   generate_series(
                   l.start_date::date,
                   l.end_date::date,
                   '1 day'::interval
                 ) s(d)
          WHERE  EXTRACT(DOW FROM s.d) BETWEEN 1 AND 5
        )
      END
    ), 0) AS used_days
  FROM   leaves l
  WHERE  l.organization_id = 1
    AND  l.leave_type = 'casual'
    AND  l.status     = 'approved'
    AND  l.start_date >= '2026-04-01'
    AND  l.end_date   <= '2027-03-31'
    AND  l.user_id IN (SELECT user_id FROM emp_lookup)
  GROUP BY l.user_id
),
adjustments AS (
  SELECT
    el.user_id,
    ROUND((el.target_balance - 20 + COALESCE(uc.used_days, 0)) * 2) / 2 AS delta
  FROM   emp_lookup el
  LEFT   JOIN used_cl uc ON uc.user_id = el.user_id
)
INSERT INTO leave_balance_adjustments
  (user_id, org_id, leave_type, year, delta, reason, adjusted_by)
SELECT
  a.user_id,
  1,
  'casual',
  2026,
  a.delta,
  'Opening CL balance import — FY 2026-27 (2026-09-02)',
  (SELECT id FROM users
   WHERE  organization_id = 1
     AND  role IN ('root_admin','admin')
   ORDER BY id LIMIT 1)
FROM   adjustments a
WHERE  a.delta <> 0;


COMMIT;


-- ─────────────────────────────────────────────────────────────
-- VERIFICATION (read-only — run after COMMIT)
-- ─────────────────────────────────────────────────────────────

-- V1. Financial year setting
SELECT name, leave_year_start_month
FROM   organizations
WHERE  id = 1;

-- V2. Leave policies
SELECT leave_type, label, annual_quota, paid, active
FROM   leave_policies
WHERE  organization_id = 1
ORDER  BY active DESC, leave_type;

-- V3. Adjustment rows inserted
SELECT u.employee_id, u.name, lba.delta
FROM   leave_balance_adjustments lba
JOIN   users u ON u.id = lba.user_id
WHERE  lba.org_id = 1 AND lba.year = 2026 AND lba.leave_type = 'casual'
ORDER  BY u.employee_id::int;

-- V4. Effective remaining balance for all 9 employees
SELECT
  u.employee_id,
  u.name,
  20                                                    AS quota,
  COALESCE(SUM(lba.delta), 0)                           AS adjustment,
  COALESCE(uc.used_days, 0)                             AS used_in_system,
  GREATEST(0,
    20 + COALESCE(SUM(lba.delta), 0)
       - COALESCE(uc.used_days, 0))                     AS remaining
FROM (VALUES
  ('480'),('674'),('677'),('692'),('693'),
  ('694'),('802'),('804'),('806')
) AS t(emp_id)
JOIN   users u
       ON  u.organization_id = 1
       AND u.employee_id     = t.emp_id
LEFT   JOIN leave_balance_adjustments lba
       ON  lba.user_id    = u.id
       AND lba.org_id     = 1
       AND lba.year       = 2026
       AND lba.leave_type = 'casual'
LEFT   JOIN LATERAL (
  SELECT COALESCE(SUM(
    CASE l.leave_time
      WHEN 'half' THEN 0.5
      ELSE (
        SELECT COUNT(*)::numeric
        FROM   generate_series(
                 l.start_date::date, l.end_date::date,
                 '1 day'::interval) s(d)
        WHERE  EXTRACT(DOW FROM s.d) BETWEEN 1 AND 5
      )
    END
  ), 0) AS used_days
  FROM  leaves l
  WHERE l.user_id         = u.id
    AND l.organization_id = 1
    AND l.leave_type      = 'casual'
    AND l.status          = 'approved'
    AND l.start_date     >= '2026-04-01'
    AND l.end_date       <= '2027-03-31'
) uc ON true
GROUP  BY u.employee_id, u.name, uc.used_days
ORDER  BY u.employee_id::int;
