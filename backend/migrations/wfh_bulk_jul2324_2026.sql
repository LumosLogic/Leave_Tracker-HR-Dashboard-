-- ══════════════════════════════════════════════════════════════════════════════
-- WFH Bulk Insert — Jul 23–24, 2026 (Heavy Rain, Company-Wide)
-- Org: LumosLogic (id = 2)
-- Run: docker compose cp backend/migrations/wfh_bulk_jul2324_2026.sql postgres:/tmp/wfh_bulk_jul2324_2026.sql
--      docker compose exec postgres psql -U lumos_admin -d lumos_hrms -f /tmp/wfh_bulk_jul2324_2026.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- Check actual leaves table columns first
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'leaves'
ORDER  BY ordinal_position;
