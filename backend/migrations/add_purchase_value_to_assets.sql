-- BUG_133: Add purchase_value column to assets table if it does not already exist.
-- Run once on the PostgreSQL database before deploying the assets module updates.
-- The assets routes already handle NULL purchase_value gracefully.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_value NUMERIC(12,2);
