-- Migration: Historical sync tracking for biometric devices
-- Date: 2026-08-21
-- Adds last_sync_requested_at + last_sync_status to biometric_devices
-- so the admin UI can show when a force-historical-sync was last requested
-- and what state it is in (idle → requested → syncing).

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS last_sync_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status        TEXT NOT NULL DEFAULT 'idle';

-- Index for quick lookups when displaying per-org device list
CREATE INDEX IF NOT EXISTS idx_bio_devices_sync_status
  ON biometric_devices (org_id, last_sync_requested_at DESC)
  WHERE last_sync_requested_at IS NOT NULL;
