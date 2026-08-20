-- Migration: Add salary_calculation_rules JSONB column to payroll_settings
-- Run: docker cp backend/migrations/add_salary_calculation_rules.sql lumos_postgres:/tmp/salary_rules.sql
--      docker exec -it lumos_postgres psql -U lumos_admin -d lumos_hrms -f /tmp/salary_rules.sql

ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS salary_calculation_rules JSONB DEFAULT NULL;
