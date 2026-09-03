-- Migration: Add per_day_salary_basis to payroll_settings
-- Idempotent (IF NOT EXISTS). Safe to re-run.
--
-- 'working_days'  (default) — gross ÷ actual non-weekend working days in month.
--   August sun_only = 26 working days → per-day = gross/26
--
-- 'calendar_days' — gross ÷ total calendar days in month regardless of weekends.
--   August = gross/31
--   LOP day COUNT still uses actual working days; only the per-day RATE changes.
--   Used by Relitrade (org_id=1) per confirmed HR policy.

ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS per_day_salary_basis TEXT NOT NULL DEFAULT 'working_days'
    CHECK (per_day_salary_basis IN ('working_days', 'calendar_days'));

-- Apply calendar_days to Relitrade immediately
UPDATE payroll_settings
   SET per_day_salary_basis = 'calendar_days'
 WHERE organization_id = 1;
