-- ============================================================
-- Relitrade (org_id=1) — PF / ESI Dynamic Calculation Mode
-- Scope   : employee_salary_structures, statutory_pf_config,
--           statutory_esi_config
-- Reason  : Enable LOP-adjusted calendar-day dynamic PF/ESI for
--           Vishal Solanki; disable PF for Bhavna & Bhavya (data
--           entry error); insert statutory rate config for org 1.
-- Safe    : idempotent ON CONFLICT guards; no payslip writes.
-- Run     : BEFORE next payroll generation.
--
-- Docker commands:
--   docker cp backend/migrations/0042_pf_esi_calc_mode.sql lumos_postgres:/tmp/0042_pf_esi_calc_mode.sql
--   docker exec -it lumos_postgres psql -U lumos_admin -d lumos_hrms -f /tmp/0042_pf_esi_calc_mode.sql
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add pf_calc_mode / esi_calc_mode columns
--    'fixed'    → use sal.employee_pf / sal.employee_esi as-is (current behaviour)
--    'dynamic'  → calculate from LOP-adjusted calendar-day wages × statutory rate
--    'disabled' → deduction = 0 regardless of stored value or statutory config
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE employee_salary_structures
  ADD COLUMN IF NOT EXISTS pf_calc_mode  TEXT NOT NULL DEFAULT 'fixed'
    CHECK (pf_calc_mode  IN ('fixed', 'dynamic', 'disabled')),
  ADD COLUMN IF NOT EXISTS esi_calc_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (esi_calc_mode IN ('fixed', 'dynamic', 'disabled'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill all existing rows → 'fixed'
--    Preserves current behaviour for every employee not explicitly changed below.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE employee_salary_structures
   SET pf_calc_mode  = 'fixed',
       esi_calc_mode = 'fixed'
 WHERE organization_id = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vishal Solanki (user_id=50) → dynamic PF / dynamic ESI
--    salary_id=16: employee_pf=0, employee_esi=0, gross=15000, basic=7500
--    Engine will calculate:
--      payable_basic = 7500 × (28/31) = 6774.19  →  PF = 813
--      payable_gross = 15000 − 1451.61 = 13548.39 →  ESI = 102
--    Applies to ALL active and historical structures for this employee
--    so regeneration of any prior month also uses dynamic mode.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE employee_salary_structures
   SET pf_calc_mode  = 'dynamic',
       esi_calc_mode = 'dynamic'
 WHERE organization_id = 1
   AND user_id = 50;

DO $$ DECLARE cnt INT; BEGIN
  SELECT COUNT(*) INTO cnt
    FROM employee_salary_structures
   WHERE organization_id = 1
     AND user_id = 50
     AND pf_calc_mode = 'dynamic'
     AND esi_calc_mode = 'dynamic';
  IF cnt = 0 THEN
    RAISE EXCEPTION 'Vishal dynamic mode update failed — no rows matched user_id=50.';
  ELSE
    RAISE NOTICE 'Vishal (user_id=50): % structure(s) set to dynamic/dynamic.', cnt;
  END IF;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Bhavna Parekh (user_id=57, employee_id=802) → disabled PF / fixed ESI
--    employee_pf was data-entry error (906, corrected to 0 in prior migration).
--    employee_esi=113 is intentional fixed deduction — keep as fixed.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE employee_salary_structures
   SET pf_calc_mode  = 'disabled',
       esi_calc_mode = 'fixed'
 WHERE organization_id = 1
   AND user_id = 57;

DO $$ DECLARE cnt INT; BEGIN
  SELECT COUNT(*) INTO cnt
    FROM employee_salary_structures
   WHERE organization_id = 1
     AND user_id = 57
     AND pf_calc_mode = 'disabled'
     AND esi_calc_mode = 'fixed';
  IF cnt = 0 THEN
    RAISE EXCEPTION 'Bhavna mode update failed — no rows matched user_id=57.';
  ELSE
    RAISE NOTICE 'Bhavna (user_id=57): % structure(s) set to disabled/fixed.', cnt;
  END IF;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Bhavya Bhavsar (user_id=59, employee_id=806) → disabled PF / fixed ESI
--    Same pattern as Bhavna. employee_esi=113 is intentional fixed deduction.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE employee_salary_structures
   SET pf_calc_mode  = 'disabled',
       esi_calc_mode = 'fixed'
 WHERE organization_id = 1
   AND user_id = 59;

DO $$ DECLARE cnt INT; BEGIN
  SELECT COUNT(*) INTO cnt
    FROM employee_salary_structures
   WHERE organization_id = 1
     AND user_id = 59
     AND pf_calc_mode = 'disabled'
     AND esi_calc_mode = 'fixed';
  IF cnt = 0 THEN
    RAISE EXCEPTION 'Bhavya mode update failed — no rows matched user_id=59.';
  ELSE
    RAISE NOTICE 'Bhavya (user_id=59): % structure(s) set to disabled/fixed.', cnt;
  END IF;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. statutory_pf_config for org 1
--    employee_pf_pct=12% is the only value used by the engine priority model.
--    Employer-side rates stored for reference only — NOT used by engine until
--    Relitrade's intended employer contribution config is confirmed.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO statutory_pf_config (
  organization_id,
  enabled,
  pf_wage_basis,
  wage_ceiling,
  employee_pf_pct,
  employer_epf_pct,
  employer_eps_pct,
  vpf_enabled,
  vpf_pct
)
VALUES (
  1,
  true,
  'basic',   -- PF wages = basic only (not basic+DA)
  0,         -- no wage ceiling cap
  12,        -- employee contribution: 12%
  3.67,      -- employer EPF split (reference only)
  8.33,      -- employer EPS split (reference only)
  false,
  0
)
ON CONFLICT (organization_id) DO UPDATE
  SET enabled          = EXCLUDED.enabled,
      pf_wage_basis    = EXCLUDED.pf_wage_basis,
      wage_ceiling     = EXCLUDED.wage_ceiling,
      employee_pf_pct  = EXCLUDED.employee_pf_pct,
      employer_epf_pct = EXCLUDED.employer_epf_pct,
      employer_eps_pct = EXCLUDED.employer_eps_pct,
      vpf_enabled      = EXCLUDED.vpf_enabled,
      vpf_pct          = EXCLUDED.vpf_pct;

DO $$ DECLARE r RECORD; BEGIN
  SELECT enabled, employee_pf_pct INTO r
    FROM statutory_pf_config WHERE organization_id = 1;
  IF NOT r.enabled OR r.employee_pf_pct != 12 THEN
    RAISE EXCEPTION 'statutory_pf_config insert failed for org 1.';
  ELSE
    RAISE NOTICE 'statutory_pf_config: enabled=%, employee_pf_pct=%', r.enabled, r.employee_pf_pct;
  END IF;
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. statutory_esi_config for org 1
--    employee_esi_pct=0.75%, wage_limit=21000 (standard ESIC threshold).
--    Employees with gross > 21000 are ESI-ineligible (engine skips dynamic calc).
--    Employer ESI rate stored for reference only.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO statutory_esi_config (
  organization_id,
  enabled,
  wage_limit,
  employee_esi_pct,
  employer_esi_pct
)
VALUES (
  1,
  true,
  21000,  -- ESIC eligibility ceiling
  0.75,   -- employee contribution: 0.75%
  3.25    -- employer contribution (reference only)
)
ON CONFLICT (organization_id) DO UPDATE
  SET enabled          = EXCLUDED.enabled,
      wage_limit       = EXCLUDED.wage_limit,
      employee_esi_pct = EXCLUDED.employee_esi_pct,
      employer_esi_pct = EXCLUDED.employer_esi_pct;

DO $$ DECLARE r RECORD; BEGIN
  SELECT enabled, employee_esi_pct, wage_limit INTO r
    FROM statutory_esi_config WHERE organization_id = 1;
  IF NOT r.enabled OR r.employee_esi_pct != 0.75 THEN
    RAISE EXCEPTION 'statutory_esi_config insert failed for org 1.';
  ELSE
    RAISE NOTICE 'statutory_esi_config: enabled=%, employee_esi_pct=%, wage_limit=%',
      r.enabled, r.employee_esi_pct, r.wage_limit;
  END IF;
END; $$;

COMMIT;


-- ── Post-run verification (read-only, runs after COMMIT) ──────────────────────

SELECT 'calc_modes' AS check_item,
       u.name,
       u.id AS user_id,
       s.id AS salary_id,
       s.employee_pf,
       s.employee_esi,
       s.pf_calc_mode,
       s.esi_calc_mode
  FROM employee_salary_structures s
  JOIN users u ON u.id = s.user_id
 WHERE u.organization_id = 1
   AND u.id IN (50, 57, 59)
   AND s.effective_to IS NULL
 ORDER BY u.id;

SELECT 'pf_config' AS check_item,
       organization_id, enabled, pf_wage_basis, employee_pf_pct
  FROM statutory_pf_config
 WHERE organization_id = 1;

SELECT 'esi_config' AS check_item,
       organization_id, enabled, wage_limit, employee_esi_pct
  FROM statutory_esi_config
 WHERE organization_id = 1;
