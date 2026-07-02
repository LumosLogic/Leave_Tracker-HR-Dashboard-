-- Payroll patch: adds employer contribution + attendance breakdown columns
-- Safe to re-run (uses IF NOT EXISTS)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS pf_employer  NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS esi_employer NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS absent_days  INTEGER DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS leave_days   INTEGER DEFAULT 0;
