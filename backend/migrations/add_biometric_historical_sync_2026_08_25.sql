-- Migration: ZKTeco Historical Attendance Sync Jobs
-- Date: 2026-08-25
-- Adds: biometric_historical_sync_jobs table

CREATE TABLE IF NOT EXISTS biometric_historical_sync_jobs (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             BIGINT       NOT NULL,
  device_id          BIGINT       NOT NULL,
  serial_number      TEXT         NOT NULL,
  from_date          DATE         NOT NULL,
  to_date            DATE         NOT NULL,
  dry_run            BOOLEAN      NOT NULL DEFAULT false,
  status             TEXT         NOT NULL DEFAULT 'pending',
    -- pending | running | completed | failed
  started_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  records_received   INT          NOT NULL DEFAULT 0,
  records_in_range   INT          NOT NULL DEFAULT 0,
  records_inserted   INT          NOT NULL DEFAULT 0,
  records_duplicate  INT          NOT NULL DEFAULT 0,
  records_ignored    INT          NOT NULL DEFAULT 0,
  error              TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bio_hist_jobs_org
  ON biometric_historical_sync_jobs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bio_hist_jobs_device
  ON biometric_historical_sync_jobs (device_id);

-- Partial index for cheap "is any job running?" check
CREATE INDEX IF NOT EXISTS idx_bio_hist_jobs_active
  ON biometric_historical_sync_jobs (status, device_id)
  WHERE status IN ('pending', 'running');
