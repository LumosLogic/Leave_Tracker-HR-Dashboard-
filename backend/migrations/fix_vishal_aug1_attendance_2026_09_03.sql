-- ============================================================
-- Vishal Atmarambhai Solanki (user_id=50) — Aug 1, 2026
-- Scope  : org_id = 1 (Relitrade)
-- Reason : Attendance status recorded as 'half_day' but biometric
--          work_hours = 3.93h, which meets Saturday Shift full_day_hours = 3h.
--          Status should be 'present' per the shift's attendance rules.
-- Effect : Payroll engine will classify Aug 1 as presentFull (1.0)
--          instead of presentHalf (0.5), reducing LOP by 0.5 days.
-- Safe   : UPDATE only affects one specific attendance record.
-- ============================================================

BEGIN;

-- Guard: verify the record exists with half_day status before correcting
DO $$
DECLARE
  v_work_hours NUMERIC;
  v_status     TEXT;
BEGIN
  SELECT status, COALESCE(work_hours, 0)
    INTO v_status, v_work_hours
    FROM attendance
   WHERE user_id = 50
     AND organization_id = 1
     AND date::date = '2026-08-01';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record for Vishal on 2026-08-01 not found — aborting.';
  END IF;

  IF v_status != 'half_day' THEN
    RAISE NOTICE 'Status is already %. No change needed.', v_status;
    RETURN;
  END IF;

  IF v_work_hours < 3 THEN
    RAISE EXCEPTION 'work_hours = % is less than full_day_hours = 3 — manual review required.', v_work_hours;
  END IF;
END;
$$;

-- Apply correction: half_day → present
UPDATE attendance
   SET status = 'present'
 WHERE user_id = 50
   AND organization_id = 1
   AND date::date = '2026-08-01'
   AND status = 'half_day';

-- Verify
SELECT date::text, status, work_hours
  FROM attendance
 WHERE user_id = 50
   AND organization_id = 1
   AND date::date = '2026-08-01';

COMMIT;
