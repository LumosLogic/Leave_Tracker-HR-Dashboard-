-- ============================================================
-- Migration: Attendance Break Tracking + Leave Remarks
-- Run this in Supabase SQL Editor → New query
-- Safe to run on existing databases (uses ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- Attendance: add break tracking columns
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS break_start TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS break_end TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS gross_hours NUMERIC DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS total_break_minutes INTEGER DEFAULT 0;

-- Leaves: add reviewer remarks column
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Leave Policies: add configurable rule fields
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS half_day_allowed BOOLEAN DEFAULT TRUE;
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE;
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS require_document BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS min_notice_days INTEGER DEFAULT 0;
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS max_consecutive_days INTEGER DEFAULT 0;
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
