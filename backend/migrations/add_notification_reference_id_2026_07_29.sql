-- ============================================================
-- Add reference_id to notifications table
-- Allows notifications to be linked to their source entity
-- (announcement, leave, expense, etc.) for accurate cleanup.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
--
-- Run on production:
--   psql -U lumos_admin -d lumos_hrms -f backend/migrations/add_notification_reference_id_2026_07_29.sql
-- Or:
--   docker exec -i lumos_postgres psql -U lumos_admin -d lumos_hrms << 'EOF'
--   ... (paste SQL) ...
--   EOF
-- ============================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS reference_id   BIGINT,
  ADD COLUMN IF NOT EXISTS reference_type TEXT;

-- Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_notifications_reference
  ON notifications (organization_id, type, reference_id)
  WHERE reference_id IS NOT NULL;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name IN ('reference_id', 'reference_type')
ORDER BY column_name;
