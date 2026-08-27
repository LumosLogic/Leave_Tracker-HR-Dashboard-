-- Automatic Biometric Sync — schedule config table
-- org_id is BIGINT to match organizations.id (bigint, not uuid)
-- Created: 2026-08-27

CREATE TABLE IF NOT EXISTS biometric_auto_sync_config (
  id              BIGSERIAL    PRIMARY KEY,
  org_id          BIGINT       NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  enabled         BOOLEAN      NOT NULL DEFAULT false,
  frequency       TEXT         NOT NULL DEFAULT 'day' CHECK (frequency IN ('day', 'week', 'month')),
  sync_time_1     TEXT         NOT NULL DEFAULT '10:00',
  sync_time_2     TEXT         DEFAULT '17:00',

  last_sync_at    TIMESTAMPTZ,
  last_sync_date  DATE,
  last_sync_status TEXT        DEFAULT 'never',
  last_sync_error TEXT,

  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),

  UNIQUE (org_id)
);

ALTER TABLE biometric_historical_sync_jobs
  ADD COLUMN IF NOT EXISTS auto_triggered BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_auto_sync_config_org ON biometric_auto_sync_config(org_id);
CREATE INDEX IF NOT EXISTS idx_hist_jobs_auto_triggered
  ON biometric_historical_sync_jobs(org_id, auto_triggered, created_at DESC)
  WHERE auto_triggered = true;
