-- Migration: shift-specific work schedule and attendance rules
-- Date: 2026-09-02
--
-- Problem: Work Schedule and Attendance Rules were org-wide only.
--          Multiple shifts with different timings shared a single configuration.
--
-- Solution: Add nullable attendance-rule columns to the shifts table.
--           NULL = inherit from org-level work_schedule (backward compatible).
--           When an employee has a shift assignment for a date, the engine
--           uses the shift's own config; otherwise falls back to org defaults.
--
-- Safe to run multiple times (IF NOT EXISTS / idempotent).

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS late_threshold        TEXT,
  ADD COLUMN IF NOT EXISTS early_exit_threshold  TEXT,
  ADD COLUMN IF NOT EXISTS half_day_hours        NUMERIC,
  ADD COLUMN IF NOT EXISTS full_day_hours        NUMERIC,
  ADD COLUMN IF NOT EXISTS max_early_leave_count INT;

-- Documentation comments
COMMENT ON COLUMN shifts.late_threshold        IS 'HH:MM — check-in after this = late. NULL = use org work_schedule.late_threshold';
COMMENT ON COLUMN shifts.early_exit_threshold  IS 'HH:MM — check-out before this = early exit. NULL = use org work_schedule.early_exit_threshold';
COMMENT ON COLUMN shifts.half_day_hours        IS 'Hours below which attendance = half-day. NULL = use org work_schedule.half_day_hours';
COMMENT ON COLUMN shifts.full_day_hours        IS 'Hours at/above which attendance = full day. NULL = use org work_schedule.full_day_hours';
COMMENT ON COLUMN shifts.max_early_leave_count IS 'Max early-leave days per month before LOP. NULL = use org work_schedule.max_early_leave_count';
