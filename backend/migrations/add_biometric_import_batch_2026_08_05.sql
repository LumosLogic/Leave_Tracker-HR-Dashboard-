-- Migration: EasyWDMS historical import support
-- Date: 2026-08-05
-- Adds: source + import_batch_id columns to biometric_raw_logs
--       biometric_import_batches table for audit and rollback

-- 1. Tag every existing live row as 'adms_live' and add import_batch_id
ALTER TABLE biometric_raw_logs
  ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'adms_live',
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- 2. Indexes for fast batch lookups and source filtering
CREATE INDEX IF NOT EXISTS idx_bio_logs_source ON biometric_raw_logs (source);
CREATE INDEX IF NOT EXISTS idx_bio_logs_batch  ON biometric_raw_logs (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- 3. Import batch audit table
CREATE TABLE IF NOT EXISTS biometric_import_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       BIGINT  NOT NULL,
  filename     TEXT,
  total_rows   INT     NOT NULL DEFAULT 0,
  inserted     INT     NOT NULL DEFAULT 0,
  skipped      INT     NOT NULL DEFAULT 0,
  error_count  INT     NOT NULL DEFAULT 0,
  imported_by  BIGINT,
  status       TEXT    NOT NULL DEFAULT 'completed',   -- processing | completed | rolled_back
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bio_batches_org ON biometric_import_batches (org_id, created_at DESC);
