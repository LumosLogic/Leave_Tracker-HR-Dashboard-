-- Migration: add HR verification fields to employee_bank_accounts
-- Date: 2026-07-23
-- Purpose: Track whether bank accounts added by employees have been reviewed by HR

ALTER TABLE employee_bank_accounts
  ADD COLUMN IF NOT EXISTS hr_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hr_verified_by INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS hr_verified_at TIMESTAMPTZ;

-- Mark all existing accounts as verified (they were admin-added before this migration)
UPDATE employee_bank_accounts SET hr_verified = TRUE WHERE created_at < NOW();

COMMENT ON COLUMN employee_bank_accounts.hr_verified IS 'True = HR has reviewed and verified this account; False = pending HR review (typically employee self-added)';
COMMENT ON COLUMN employee_bank_accounts.hr_verified_by IS 'User ID of the HR/admin who verified this bank account';
COMMENT ON COLUMN employee_bank_accounts.hr_verified_at IS 'Timestamp when the account was HR-verified';
