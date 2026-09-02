-- Probation Management Migration — 2026-09-02
-- Run once on each database (platform + Relitrade) before deploying new code.

-- ── 1. Org-level probation settings in payroll_settings ─────────────────────
ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS probation_enabled           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_probation_months    INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS paid_leave_during_probation BOOLEAN DEFAULT TRUE;

-- ── 2. Employee-level probation tracking in users ────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS probation_start_date DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date   DATE;

-- probation_applicable and probation_months already exist from sanghavi_migration.sql
-- Add them idempotently in case this is a non-Sanghavi DB
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS probation_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS probation_months     INTEGER DEFAULT 0;

-- ── 3. Probation scope: 'selected' (per-employee) or 'all' (company-wide) ───
ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS probation_scope TEXT DEFAULT 'selected';
