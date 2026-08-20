-- BUG_120 / BUG_133: Add purchase_value column to assets table
-- This fixes the 500 error on /api/assets ("column purchase_value does not exist")
--
-- RUN ON SERVER:
--   docker cp backend/migrations/bug120_133_assets_purchase_value.sql lumos_postgres:/tmp/bug120_assets.sql
--   docker exec -it lumos_postgres psql -U lumos_admin -d lumos_hrms -f /tmp/bug120_assets.sql

ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_value NUMERIC(12,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS warranty_expiry DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_date DATE;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'assets'
  AND column_name IN ('purchase_value','warranty_expiry','purchase_date');
