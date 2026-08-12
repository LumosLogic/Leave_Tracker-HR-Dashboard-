-- Fix chk_ess_date_range: change from strict > to >= so that a salary structure
-- whose effective_to equals effective_from (single-day revision) is permitted.
-- Also adds special_allowance to the legacy payroll_structures table so legacy
-- routes do not error if the column is ever queried directly.

-- 1. Fix the date-range constraint on employee_salary_structures
ALTER TABLE employee_salary_structures
  DROP CONSTRAINT IF EXISTS chk_ess_date_range;

ALTER TABLE employee_salary_structures
  ADD CONSTRAINT chk_ess_date_range
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

-- 2. Add missing columns to the legacy payroll_structures table (idempotent)
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS special_allowance NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS other_allowance   NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS employee_pf       NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS employee_esi      NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS employer_pf       NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS employer_esi      NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS other_deductions  NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS ctc               NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS notes             TEXT;
