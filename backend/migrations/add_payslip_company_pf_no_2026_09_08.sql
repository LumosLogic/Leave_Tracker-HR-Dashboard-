-- Migration: Add Company PF No. field to payroll_settings
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- Run on Relitrade DB and any other org DB.

ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS payslip_company_pf_no TEXT;
