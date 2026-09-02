-- ============================================================
-- Priyanshi Sheth — Leave Fix: ID 215 end_date correction
-- Scope  : org_id = 1 (Relitrade)
-- Date   : 2026-09-03
-- Fix    : ID 215 spanned Aug 28–29 full (overlapping ID 214).
--          Correct ID 215 end_date to Aug 28 only.
--          ID 214 (Aug 29 half) remains unchanged.
-- Result : Aug 28 = 1.0 LOP, Aug 29 = 0.5 LOP → 1.5 leave LOP
--          + Aug 14 absent = 1.0 LOP → TOTAL = 2.5 LOP ✓
-- Safe   : Transactional. No other employee data touched.
-- ============================================================

BEGIN;

-- Guard: confirm both leave IDs belong to Priyanshi before touching anything
DO $$
DECLARE
  v_user_id BIGINT;
  v_count   INT;
BEGIN
  SELECT id INTO v_user_id
  FROM users
  WHERE organization_id = 1 AND device_enrollment_id = '805';

  SELECT COUNT(*) INTO v_count
  FROM leaves
  WHERE id IN (214, 215)
    AND user_id = v_user_id
    AND organization_id = 1;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected both leave IDs 214 and 215 to belong to Priyanshi (user %), found %', v_user_id, v_count;
  END IF;

  RAISE NOTICE 'Guard passed — both IDs belong to user_id=%', v_user_id;
END;
$$;

-- Fix: trim ID 215 to Aug 28 only
UPDATE leaves
SET    end_date = '2026-08-28'
WHERE  id = 215
  AND  organization_id = 1
  AND  start_date = '2026-08-28'
  AND  end_date   = '2026-08-29';

-- Confirm exactly 1 row was updated
DO $$
BEGIN
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT: UPDATE matched 0 rows — leave ID 215 may already be corrected or has unexpected values';
  END IF;
END;
$$;

COMMIT;


-- ─────────────────────────────────────────────────────────────
-- VERIFICATION (read-only — run after COMMIT)
-- ─────────────────────────────────────────────────────────────

-- V1. Confirm leave records are now non-overlapping
SELECT id, leave_type, leave_time, start_date::text, end_date::text, status
FROM   leaves
WHERE  id IN (214, 215)
ORDER  BY id;

-- V2. All August approved leaves for Priyanshi
SELECT id, leave_type, leave_time, start_date::text, end_date::text, status
FROM   leaves
WHERE  user_id = (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='805')
  AND  organization_id = 1
  AND  start_date >= '2026-08-01' AND end_date <= '2026-08-31'
ORDER  BY start_date, id;
