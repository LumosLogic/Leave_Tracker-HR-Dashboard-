-- Migration: org-level attendance policy
-- Safe to re-run (IF NOT EXISTS / UPDATE is idempotent).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS attendance_policy VARCHAR(50) NOT NULL DEFAULT 'standard';

-- Relitrade (org id=1): door-sensor biometric — first punch = check-in, last = check-out
UPDATE organizations
  SET attendance_policy = 'first_in_last_out'
  WHERE id = 1;
