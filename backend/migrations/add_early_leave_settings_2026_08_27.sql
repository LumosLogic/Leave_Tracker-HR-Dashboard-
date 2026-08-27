-- Migration: add full_day_hours and max_early_leave_count to work_schedule
-- Run once per organization database.
-- full_day_hours: minimum working hours for a Full Day (default 8).
--   If work_hours < half_day_hours → half_day
--   If work_hours >= half_day_hours AND < full_day_hours → early_leave
--   If work_hours >= full_day_hours → present
-- max_early_leave_count: how many early_leave occurrences are allowed per
--   payroll period before excess ones become LOP (default 3).

ALTER TABLE work_schedule
  ADD COLUMN IF NOT EXISTS full_day_hours NUMERIC DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_early_leave_count INTEGER DEFAULT 3;
