-- Phase 3.8 — Payroll Permissions Fix + M-7 Approval Gate
--
-- Fixes:
--   1. payroll.unlock was used in POST /payroll/unlock/:id but never seeded → always 403
--   2. payroll.view_payslips was used in GET /payslips/all but never seeded → always 403
--   3. leaves.manage was used in POST /leaves/balance/adjust but never seeded → always 403
--   4. M-7: HR Admin had payroll.lock → could lock payroll without Root Admin sign-off
--
-- Safe to re-run: INSERT ... ON CONFLICT DO NOTHING; DELETE is a no-op if row absent.
--
-- Run: psql -U lumos_admin -d lumos_hrms -f phase3_08_payroll_permissions_fix.sql

BEGIN;

-- ─── Step 1: Add missing permissions to the global catalog ────────────────────

INSERT INTO permissions (module_key, action, label, description) VALUES
  ('payroll', 'unlock',        'Unlock Payroll Run',      'Reopen a locked payroll run for corrections. Root Admin only.'),
  ('payroll', 'view_payslips', 'View All Payslips',       'View all employee payslips for any period.'),
  ('leaves',  'manage',        'Manage Leave Balances',   'Manually adjust employee leave balances (grant or deduct days).')
ON CONFLICT (module_key, action) DO NOTHING;

-- ─── Step 2: Assign new permissions to root_admin in every org ────────────────
-- root_admin gets all three new permissions.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
CROSS  JOIN permissions p
WHERE  r.slug = 'root_admin'
  AND  r.is_system_role = true
  AND  (p.module_key, p.action) IN (
         ('payroll', 'unlock'),
         ('payroll', 'view_payslips'),
         ('leaves',  'manage')
       )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── Step 3: Assign view_payslips + leaves.manage to hr_admin ─────────────────
-- HR Admin can view all payslips and adjust leave balances, but cannot unlock payroll.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
CROSS  JOIN permissions p
WHERE  r.slug = 'hr_admin'
  AND  r.is_system_role = true
  AND  (p.module_key, p.action) IN (
         ('payroll', 'view_payslips'),
         ('leaves',  'manage')
       )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── Step 4: M-7 — Remove payroll.lock from hr_admin (Root Admin gate) ────────
-- HR Admin can generate payroll but not lock it.
-- Root Admin must review and lock the run before payslips are finalized.

DELETE FROM role_permissions
WHERE role_id IN (
        SELECT id FROM roles WHERE slug = 'hr_admin' AND is_system_role = true
      )
  AND permission_id IN (
        SELECT id FROM permissions WHERE module_key = 'payroll' AND action = 'lock'
      );

-- ─── Record migration ──────────────────────────────────────────────────────────

INSERT INTO schema_migrations(version, description)
VALUES ('20260731_rbac_payroll_fix', 'Fix missing payroll/leaves permissions; gate payroll.lock to root_admin only (M-7)')
ON CONFLICT (version) DO NOTHING;

COMMIT;
