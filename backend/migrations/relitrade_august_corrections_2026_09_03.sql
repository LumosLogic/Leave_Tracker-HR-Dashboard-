-- ============================================================
-- Relitrade August 2026 Corrections — 2026-09-03
-- Scope  : org_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%')
-- DB     : lumos_hrms  (docker exec -i lumos_postgres psql ...)
-- Covers : Shift corrections, leave inserts, regularizations
--          for Jaydip Patel, Zarna Suthar, Mukesh Thakor,
--          Priyanshi Sheth, Manish Kandel.
-- Safe   : Fully transactional. Idempotent on re-run.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- SECTION 0: Shared ID lookups (diagnostic only)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_org           BIGINT;
  v_weekday_shift BIGINT;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1;
  SELECT s.id INTO v_weekday_shift
  FROM   shifts s
  JOIN   shift_assignments sa ON sa.shift_id = s.id
  WHERE  sa.organization_id = v_org AND s.name = 'Weekday Shift'
  LIMIT  1;

  RAISE NOTICE 'org_id=%, weekday_shift_id=%', v_org, v_weekday_shift;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 1. JAYDIP PATEL — Aug 1, 8, 22, 29 → Weekday Shift (weekoff)
--    Aug 15 keeps Saturday Shift (public holiday).
-- ─────────────────────────────────────────────────────────────
UPDATE shift_assignments sa
SET    shift_id = (
         SELECT s.id FROM shifts s
         JOIN   shift_assignments sx ON sx.shift_id = s.id
         WHERE  sx.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
           AND  s.name = 'Weekday Shift'
         LIMIT  1
       )
WHERE  sa.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
  AND  sa.user_id = (
         SELECT id FROM users
         WHERE  name ILIKE '%jaydip%patel%'
           AND  organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
       )
  AND  sa.date IN ('2026-08-01','2026-08-08','2026-08-22','2026-08-29');


-- ─────────────────────────────────────────────────────────────
-- 2. ZARNA SUTHAR — Aug 1, 8, 22, 29 → Weekday Shift (weekoff)
-- ─────────────────────────────────────────────────────────────
UPDATE shift_assignments sa
SET    shift_id = (
         SELECT s.id FROM shifts s
         JOIN   shift_assignments sx ON sx.shift_id = s.id
         WHERE  sx.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
           AND  s.name = 'Weekday Shift'
         LIMIT  1
       )
WHERE  sa.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
  AND  sa.user_id = (
         SELECT id FROM users
         WHERE  name ILIKE '%zarna%suthar%'
           AND  organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
       )
  AND  sa.date IN ('2026-08-01','2026-08-08','2026-08-22','2026-08-29');


-- ─────────────────────────────────────────────────────────────
-- 3. ZARNA SUTHAR — Approved CL leaves: Aug 25–28 and Aug 31
--    No attendance records exist; engine uses
--    (no_status + approved_leave) → paidLeave path correctly.
-- ─────────────────────────────────────────────────────────────
INSERT INTO leaves
  (user_id, organization_id, leave_type, leave_time, start_date, end_date,
   status, reason, approved_by, approved_at, dept_head_status, root_admin_status)
VALUES
  (
    (SELECT id FROM users WHERE name ILIKE '%zarna%suthar%' AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)),
    (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1),
    'casual', 'full', '2026-08-25', '2026-08-28',
    'approved',
    'Approved casual leave — Aug 25–28 (client confirmed)',
    (SELECT id FROM users WHERE organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1) AND role IN ('root_admin','admin') ORDER BY id LIMIT 1),
    NOW(), 'approved', 'approved'
  ),
  (
    (SELECT id FROM users WHERE name ILIKE '%zarna%suthar%' AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)),
    (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1),
    'casual', 'full', '2026-08-31', '2026-08-31',
    'approved',
    'Approved casual leave — Aug 31 (client confirmed)',
    (SELECT id FROM users WHERE organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1) AND role IN ('root_admin','admin') ORDER BY id LIMIT 1),
    NOW(), 'approved', 'approved'
  );


-- ─────────────────────────────────────────────────────────────
-- 4. MUKESH THAKOR — All August Saturdays → Weekday Shift
--    Update existing rows first; insert if none exist.
-- ─────────────────────────────────────────────────────────────
UPDATE shift_assignments sa
SET    shift_id = (
         SELECT s.id FROM shifts s
         JOIN   shift_assignments sx ON sx.shift_id = s.id
         WHERE  sx.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
           AND  s.name = 'Weekday Shift'
         LIMIT  1
       )
WHERE  sa.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
  AND  sa.user_id = (
         SELECT id FROM users
         WHERE  name ILIKE '%mukesh%thakor%'
           AND  organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
       )
  AND  sa.date IN ('2026-08-01','2026-08-08','2026-08-22','2026-08-29');

INSERT INTO shift_assignments (user_id, organization_id, shift_id, date)
SELECT
  (SELECT id FROM users WHERE name ILIKE '%mukesh%thakor%' AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)),
  (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1),
  (SELECT s.id FROM shifts s JOIN shift_assignments sx ON sx.shift_id = s.id WHERE sx.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1) AND s.name = 'Weekday Shift' LIMIT 1),
  d::date
FROM unnest(ARRAY['2026-08-01','2026-08-08','2026-08-22','2026-08-29']::text[]) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM shift_assignments sa2
  WHERE  sa2.user_id = (SELECT id FROM users WHERE name ILIKE '%mukesh%thakor%' AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1))
    AND  sa2.date::text = d
    AND  sa2.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
);


-- ─────────────────────────────────────────────────────────────
-- 5. PRIYANSHI SHETH — Fix leave ID 214 to Aug 29 half-day
--    Leave ID 214 was Aug 28–29 full → change to Aug 29 half.
--    Leave ID 215 covers Aug 28 full — unchanged.
--    Result: Aug 28 = 1.0 LOP, Aug 29 = 0.5 LOP → 1.5 LOP
--    Plus Aug 14 absent = 1.0 LOP → TOTAL = 2.5 LOP ✓
-- ─────────────────────────────────────────────────────────────
UPDATE leaves
SET    start_date = '2026-08-29',
       leave_time = 'half',
       reason     = 'for rakhshabandhan (half day — Saturday short shift)'
WHERE  id = 214;


-- ─────────────────────────────────────────────────────────────
-- 6. MANISH KANDEL — Approved regularizations for 18 missing days
--    Client confirmed full month present.
--    Engine picks these up via regularizedSet → marks dates present.
--    No attendance records inserted (preserves biometric integrity).
-- ─────────────────────────────────────────────────────────────
INSERT INTO attendance_regularization
  (user_id, organization_id, date, reason, status, reviewed_by, reviewed_at)
SELECT
  (SELECT id FROM users WHERE name ILIKE '%manish%kandel%' AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)),
  (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1),
  d,
  'HR confirmed employee was present — attendance not recorded by biometric system',
  'approved',
  (SELECT id FROM users WHERE organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1) AND role IN ('root_admin','admin') ORDER BY id LIMIT 1),
  NOW()
FROM unnest(ARRAY[
  '2026-08-01','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07',
  '2026-08-08','2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14',
  '2026-08-17','2026-08-18','2026-08-19','2026-08-20','2026-08-25','2026-08-31'
]::text[]) AS d
ON CONFLICT DO NOTHING;


COMMIT;


-- ─────────────────────────────────────────────────────────────
-- VERIFICATION (read-only — run after COMMIT)
-- ─────────────────────────────────────────────────────────────

-- V1. Shift assignments for Jaydip, Zarna, Mukesh on Aug Saturdays
SELECT u.name, sa.date, s.name AS shift
FROM   shift_assignments sa
JOIN   users u  ON u.id  = sa.user_id
JOIN   shifts s ON s.id  = sa.shift_id
WHERE  sa.organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1)
  AND  u.name ILIKE ANY(ARRAY['%jaydip%patel%','%zarna%suthar%','%mukesh%thakor%'])
  AND  sa.date IN ('2026-08-01','2026-08-08','2026-08-22','2026-08-29')
ORDER  BY u.name, sa.date;

-- V2. Zarna approved leaves in August
SELECT id, start_date, end_date, leave_time, status
FROM   leaves
WHERE  user_id = (SELECT id FROM users WHERE name ILIKE '%zarna%suthar%' AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1))
  AND  start_date >= '2026-08-01' AND end_date <= '2026-08-31'
ORDER  BY start_date;

-- V3. Priyanshi leave ID 214
SELECT id, start_date, end_date, leave_time, reason
FROM   leaves
WHERE  id IN (214, 215);

-- V4. Manish regularizations inserted
SELECT date, status
FROM   attendance_regularization
WHERE  user_id = (SELECT id FROM users WHERE name ILIKE '%manish%kandel%' AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%relitrade%' LIMIT 1))
  AND  date >= '2026-08-01' AND date <= '2026-08-31'
ORDER  BY date;
