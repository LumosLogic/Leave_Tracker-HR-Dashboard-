-- Add missing columns to employee_qualifications that were never persisted
-- before the BUG_050 backend fix (from_year, to_year, result_type, education_mode,
-- education_country, enrollment_number, remarks).
ALTER TABLE employee_qualifications
  ADD COLUMN IF NOT EXISTS from_year          INTEGER,
  ADD COLUMN IF NOT EXISTS to_year            INTEGER,
  ADD COLUMN IF NOT EXISTS result_type        TEXT DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS education_mode     TEXT,
  ADD COLUMN IF NOT EXISTS education_country  TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS enrollment_number  TEXT,
  ADD COLUMN IF NOT EXISTS remarks            TEXT;
