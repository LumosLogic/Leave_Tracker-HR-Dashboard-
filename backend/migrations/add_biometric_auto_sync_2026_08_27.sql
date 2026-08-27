-- Automatic EasyWDMS → HRMS Biometric Sync (device-based, reuses Historical Sync)
-- Created: 2026-08-27
-- Run: psql -U <user> -d <dbname> -f add_biometric_auto_sync_2026_08_27.sql

-- Per-org schedule configuration for automatic sync
CREATE TABLE IF NOT EXISTS biometric_auto_sync_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Schedule
  enabled         BOOLEAN NOT NULL DEFAULT false,
  frequency       TEXT NOT NULL DEFAULT 'day' CHECK (frequency IN ('day', 'week', 'month')),
  sync_time_1     TEXT NOT NULL DEFAULT '10:00',  -- HH:MM (Asia/Kolkata)
  sync_time_2     TEXT DEFAULT '17:00',            -- optional second daily time (NULL = disabled)

  -- Last sync state (updated after auto-reprocess completes)
  last_sync_at     TIMESTAMPTZ,       -- when the last auto-sync was triggered
  last_sync_date   DATE,              -- used as start of next sync window
  last_sync_status TEXT DEFAULT 'never',  -- never | running | success | failed | partial
  last_sync_error  TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (org_id)
);

-- Mark auto-triggered jobs in the existing historical sync table
ALTER TABLE biometric_historical_sync_jobs
  ADD COLUMN IF NOT EXISTS auto_triggered BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_auto_sync_config_org    ON biometric_auto_sync_config(org_id);
CREATE INDEX IF NOT EXISTS idx_hist_jobs_auto_triggered
  ON biometric_historical_sync_jobs(org_id, auto_triggered, created_at DESC)
  WHERE auto_triggered = true;
