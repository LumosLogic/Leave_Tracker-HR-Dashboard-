-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0042: PF / ESI dynamic calculation mode
--
-- Steps:
--   1. Add pf_calc_mode / esi_calc_mode columns to employee_salary_structures
--   2. Backfill all existing rows → 'fixed'  (preserves current behaviour)
--   3. Set Vishal  (user 50)  → dynamic / dynamic
--   4. Set Bhavna  (user 57)  → disabled / fixed
--   5. Set Bhavya  (user 58)  → disabled / fixed   ← confirm user_id before running
--   6. Insert statutory_pf_config  for org 1
--   7. Insert statutory_esi_config for org 1
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Step 1: add columns ───────────────────────────────────────────────────────
-- 'fixed'    → use sal.employee_pf / sal.employee_esi as-is (current behaviour)
-- 'dynamic'  → calculate from LOP-adjusted calendar-day wages × statutory rate
-- 'disabled' → deduction = 0 regardless of sal value or statutory config

ALTER TABLE employee_salary_structures
  ADD COLUMN IF NOT EXISTS pf_calc_mode  TEXT NOT NULL DEFAULT 'fixed'
    CHECK (pf_calc_mode  IN ('fixed', 'dynamic', 'disabled')),
  ADD COLUMN IF NOT EXISTS esi_calc_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (esi_calc_mode IN ('fixed', 'dynamic', 'disabled'));

-- ── Step 2: backfill all existing rows → 'fixed' ─────────────────────────────
UPDATE employee_salary_structures
   SET pf_calc_mode  = 'fixed',
       esi_calc_mode = 'fixed'
 WHERE pf_calc_mode  IS NULL
    OR esi_calc_mode IS NULL;

-- ── Step 3: Vishal Solanki (user 50) → dynamic / dynamic ─────────────────────
-- employee_pf = 0, employee_esi = 0 in salary structure ID 16.
-- Engine will calculate dynamically from LOP-adjusted calendar-day wages.
UPDATE employee_salary_structures
   SET pf_calc_mode  = 'dynamic',
       esi_calc_mode = 'dynamic'
 WHERE user_id = 50
   AND effective_to IS NULL;

-- ── Step 4: Bhavna Parekh (user 57) → disabled PF / fixed ESI ────────────────
-- employee_pf was data-entry error (906 → corrected to 0 in prior migration).
-- employee_esi = 113 is intentional fixed deduction.
UPDATE employee_salary_structures
   SET pf_calc_mode  = 'disabled',
       esi_calc_mode = 'fixed'
 WHERE user_id = 57
   AND effective_to IS NULL;

-- ── Step 5: Bhavya (user 58) → disabled PF / fixed ESI ───────────────────────
-- Same pattern as Bhavna. Confirm user_id = 58 before running.
UPDATE employee_salary_structures
   SET pf_calc_mode  = 'disabled',
       esi_calc_mode = 'fixed'
 WHERE user_id = 58
   AND effective_to IS NULL;

-- ── Step 6: statutory_pf_config for org 1 ────────────────────────────────────
-- Only employee_pf_pct is used by the engine priority model.
-- Employer-side rates (employer_epf_pct, employer_eps_pct) are NOT touched here
-- — they remain in the salary structure as fixed values until Relitrade confirms
-- their intended employer contribution configuration.
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
  'basic',    -- PF wages = basic only (not basic+DA) for Relitrade
  0,          -- no wage ceiling cap
  12,         -- employee contribution: 12%
  3.67,       -- employer EPF split (stored for reference; not used in engine yet)
  8.33,       -- employer EPS split (stored for reference; not used in engine yet)
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

-- ── Step 7: statutory_esi_config for org 1 ───────────────────────────────────
-- employee_esi_pct = 0.75%.  wage_limit = 21000 (standard ESIC threshold).
-- Employer ESI rate stored for reference only; not used in engine priority model.
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
  21000,  -- employees with gross > ₹21,000 are ESI-ineligible
  0.75,   -- employee contribution: 0.75%
  3.25    -- employer contribution (reference only; not used in engine yet)
)
ON CONFLICT (organization_id) DO UPDATE
  SET enabled          = EXCLUDED.enabled,
      wage_limit       = EXCLUDED.wage_limit,
      employee_esi_pct = EXCLUDED.employee_esi_pct,
      employer_esi_pct = EXCLUDED.employer_esi_pct;

COMMIT;
