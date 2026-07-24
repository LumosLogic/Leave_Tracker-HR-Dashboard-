-- Phase 2 Account Security migration
-- Safe to re-run (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_history      JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS totp_secret           TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_login_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip         TEXT,
  ADD COLUMN IF NOT EXISTS last_login_ua         TEXT;

CREATE TABLE IF NOT EXISTS login_history (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id BIGINT,
  ip_address      TEXT,
  user_agent      TEXT,
  status          TEXT DEFAULT 'success',
  logged_in_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user
  ON login_history(user_id, logged_in_at DESC);
