-- Migration: Add retention column to payslips table
-- Safe to re-run (IF NOT EXISTS). Default 0 means existing payslips are unaffected.
-- Run after add_salary_calculation_rules.sql.

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS retention NUMERIC(14,2) NOT NULL DEFAULT 0;
