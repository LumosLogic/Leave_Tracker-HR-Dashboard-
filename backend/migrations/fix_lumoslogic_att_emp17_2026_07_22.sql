-- ============================================================
-- Fix: LumosLogic Org 2 — Employee ID '17' — 2026-07-22
-- Problem : Employee accidentally hit Checkout instead of Break In
-- Fix     : Move check_out → break_start, set break_end = 13:56,
--           clear check_out so employee can check out normally later
-- Run in  : LumosLogic Supabase SQL editor
-- ============================================================

-- ── STEP 1: Preview what will change (run first, verify, then run Step 2) ──

SELECT
  a.id,
  u.name,
  u.employee_id,
  a.date,
  a.check_in,
  a.check_out          AS "accidental_checkout (→ will become break_start)",
  a.break_start,
  a.break_end,
  a.total_break_minutes,
  a.gross_hours,
  a.work_hours,
  a.status
FROM attendance a
JOIN users u ON u.id = a.user_id
WHERE u.organization_id = 2
  AND (u.employee_id = '17' OR u.id = 17)
  AND a.organization_id = 2
  AND a.date = '2026-07-22';


-- ── STEP 2: Apply the fix ──
-- (Only run after verifying Step 1 shows the correct record)

WITH target AS (
  SELECT a.id, a.check_out AS old_checkout
  FROM attendance a
  JOIN users u ON u.id = a.user_id
  WHERE u.organization_id = 2
    AND (u.employee_id = '17' OR u.id = 17)
    AND a.organization_id = 2
    AND a.date = '2026-07-22'
  LIMIT 1
)
UPDATE attendance
SET
  -- The accidental checkout time becomes the break start
  break_start         = target.old_checkout,
  -- Break ended at 13:56
  break_end           = '13:56',
  -- Calculate break duration in minutes: 13:56 minus whatever time checkout was set
  total_break_minutes = GREATEST(0,
    (13 * 60 + 56)
    - (
        SPLIT_PART(target.old_checkout, ':', 1)::integer * 60
      + SPLIT_PART(target.old_checkout, ':', 2)::integer
    )
  ),
  -- Clear the accidental checkout — employee is still working
  check_out           = NULL,
  -- Reset computed fields; will be recalculated properly at actual checkout
  gross_hours         = 0,
  work_hours          = 0,
  -- Ensure status stays present
  status              = 'present'
FROM target
WHERE attendance.id = target.id;


-- ── STEP 3: Verify the fix applied correctly ──

SELECT
  a.id,
  u.name,
  a.date,
  a.check_in,
  a.check_out          AS "should be NULL now",
  a.break_start        AS "break started (was accidental checkout)",
  a.break_end          AS "should be 13:56",
  a.total_break_minutes,
  a.status
FROM attendance a
JOIN users u ON u.id = a.user_id
WHERE u.organization_id = 2
  AND (u.employee_id = '17' OR u.id = 17)
  AND a.organization_id = 2
  AND a.date = '2026-07-22';
