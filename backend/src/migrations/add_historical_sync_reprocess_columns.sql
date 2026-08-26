-- Add scoped reprocess tracking columns to biometric_historical_sync_jobs
-- Run: docker cp ... then docker exec psql -f this file

ALTER TABLE biometric_historical_sync_jobs
  ADD COLUMN IF NOT EXISTS reprocess_status           VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reprocess_started_at       TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reprocess_completed_at     TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS employees_reprocessed      INTEGER      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attendance_records_updated INTEGER      DEFAULT NULL;

-- Tag raw logs with the job that inserted them so scoped reprocess is exact.
-- ON CONFLICT DO NOTHING means duplicate records keep their original job tag —
-- a record from job A that already exists is NOT re-tagged as job B's.
ALTER TABLE biometric_raw_logs
  ADD COLUMN IF NOT EXISTS historical_sync_job_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_brl_historical_sync_job_id
  ON biometric_raw_logs (historical_sync_job_id)
  WHERE historical_sync_job_id IS NOT NULL;
