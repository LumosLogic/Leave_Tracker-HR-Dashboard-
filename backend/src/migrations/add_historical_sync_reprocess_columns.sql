-- Add scoped reprocess tracking columns to biometric_historical_sync_jobs
-- Run: docker cp ... then docker exec psql -f this file

ALTER TABLE biometric_historical_sync_jobs
  ADD COLUMN IF NOT EXISTS reprocess_status        VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reprocess_started_at    TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reprocess_completed_at  TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS employees_reprocessed   INTEGER      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attendance_records_updated INTEGER   DEFAULT NULL;
