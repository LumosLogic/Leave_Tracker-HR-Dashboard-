-- ============================================================
-- Relitrade: Update individual employee PF No and ESIC No
-- Run on Relitrade DB:
--   docker exec lumos_postgres psql -U lumos_admin -d <relitrade_db> -f /tmp/relitrade_pf_esic_update.sql
-- ============================================================

-- ── PF No updates ─────────────────────────────────────────────────────────────
UPDATE users SET pf_no = '102306103352'
WHERE employee_id::text = '694' AND organization_id = 1;

-- ── ESIC No updates ───────────────────────────────────────────────────────────
UPDATE users SET esi_no = '3716242758'
WHERE employee_id::text = '638' AND organization_id = 1;

UPDATE users SET esi_no = '3716251663'
WHERE employee_id::text = '802' AND organization_id = 1;

UPDATE users SET esi_no = '3716477173'
WHERE employee_id::text = '694' AND organization_id = 1;

UPDATE users SET esi_no = '3716733023'
WHERE employee_id::text = '806' AND organization_id = 1;

UPDATE users SET esi_no = '3716243721'
WHERE employee_id::text = '642' AND organization_id = 1;

-- ── Verification ──────────────────────────────────────────────────────────────
SELECT employee_id, name, pf_no, esi_no
FROM users
WHERE employee_id::text IN ('638','642','694','802','806')
  AND organization_id = 1
ORDER BY employee_id::int;
