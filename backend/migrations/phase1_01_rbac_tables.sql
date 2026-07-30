-- ============================================================
-- PHASE 1: RBAC FOUNDATION
-- Creates roles, permissions, role_permissions, user_roles
-- Seeds all default permissions and system roles for every org
-- Seeds user_roles from existing users.role values
--
-- SAFE TO RE-RUN: All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ADDITIVE ONLY: No existing tables modified
-- RUN: psql -U lumos_admin -d lumos_hrms -f phase1_01_rbac_tables.sql
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- SECTION 0: ENSURE schema_migrations TABLE EXISTS
-- This migration inserts version records into schema_migrations.
-- The table is normally created by production_db_hardening_2026_07_29.sql.
-- This guard ensures the migration is safe to run on any database state.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  description TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by  TEXT        NOT NULL DEFAULT current_user
);
COMMENT ON TABLE schema_migrations IS
  'Append-only migration version log. Never delete rows.';


-- ─────────────────────────────────────────────────────────────
-- SECTION 1: CREATE TABLES
-- ─────────────────────────────────────────────────────────────

-- 1A. permissions — global catalog, not per-org
--     Seeded by this migration. Never modified by users.
CREATE TABLE IF NOT EXISTS permissions (
  id          BIGSERIAL PRIMARY KEY,
  module_key  TEXT NOT NULL,
  action      TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_key, action)
);
COMMENT ON TABLE permissions IS 'Global permission catalog. Seeded at installation. module_key.action pairs.';

-- 1B. roles — per organization, includes system + custom roles
CREATE TABLE IF NOT EXISTS roles (
  id             BIGSERIAL PRIMARY KEY,
  org_id         BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  description    TEXT DEFAULT '',
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name
  ON roles(org_id, LOWER(TRIM(name)));
CREATE INDEX IF NOT EXISTS idx_roles_org
  ON roles(org_id);
COMMENT ON TABLE roles IS 'Per-org roles. System roles (is_system_role=true) are seeded and cannot be deleted.';

-- 1C. role_permissions — which permissions belong to a role
CREATE TABLE IF NOT EXISTS role_permissions (
  id            BIGSERIAL PRIMARY KEY,
  role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_rp_role_id
  ON role_permissions(role_id);
COMMENT ON TABLE role_permissions IS 'Links roles to their granted permissions.';

-- 1D. user_roles — which roles a user holds within an org
CREATE TABLE IF NOT EXISTS user_roles (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_ur_user_org
  ON user_roles(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_ur_role
  ON user_roles(role_id);
COMMENT ON TABLE user_roles IS 'Maps users to roles within their org. Supports multiple roles per user.';

-- ─────────────────────────────────────────────────────────────
-- SECTION 1E: DISABLE ROW LEVEL SECURITY
-- Consistent with all other tables in the schema — RLS is
-- disabled system-wide; app handles auth via JWT middleware.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE permissions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles         DISABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles    DISABLE ROW LEVEL SECURITY;

-- Record this migration
INSERT INTO schema_migrations(version, description)
VALUES ('20260730_rbac_001', 'RBAC tables: permissions, roles, role_permissions, user_roles')
ON CONFLICT (version) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: SEED ALL PERMISSIONS
-- Global catalog — one row per module.action pair
-- ─────────────────────────────────────────────────────────────

INSERT INTO permissions (module_key, action, label, description) VALUES
  -- Dashboard
  ('dashboard',     'view',                    'View Dashboard',               'Access the main dashboard'),

  -- Employees
  ('employees',     'view',                    'View Employees',               'View employee list and profiles'),
  ('employees',     'create',                  'Create Employees',             'Add new employees to the system'),
  ('employees',     'edit',                    'Edit Employees',               'Modify employee information'),
  ('employees',     'delete',                  'Delete Employees',             'Remove employees from the system'),
  ('employees',     'export',                  'Export Employees',             'Export employee data to CSV/Excel'),

  -- Departments
  ('departments',   'view',                    'View Departments',             'View department list'),
  ('departments',   'create',                  'Create Departments',           'Create new departments'),
  ('departments',   'edit',                    'Edit Departments',             'Modify department details'),
  ('departments',   'delete',                  'Delete Departments',           'Remove departments'),

  -- Designations
  ('designations',  'view',                    'View Designations',            'View designation list'),
  ('designations',  'manage',                  'Manage Designations',          'Create, edit and delete designations'),

  -- Attendance
  ('attendance',    'view',                    'View Attendance',              'View attendance records'),
  ('attendance',    'edit',                    'Edit Attendance',              'Manually edit attendance records'),
  ('attendance',    'export',                  'Export Attendance',            'Export attendance to CSV/Excel'),
  ('attendance',    'approve_regularization',  'Approve Regularization',       'Approve attendance regularization requests'),

  -- Leaves
  ('leaves',        'view',                    'View Leaves',                  'View leave requests'),
  ('leaves',        'create',                  'Apply for Leave',              'Submit leave requests'),
  ('leaves',        'approve',                 'Approve Leaves',               'Approve leave requests'),
  ('leaves',        'reject',                  'Reject Leaves',                'Reject leave requests'),
  ('leaves',        'forward',                 'Forward Leaves',               'Forward leave requests to next approver'),
  ('leaves',        'export',                  'Export Leaves',                'Export leave data to CSV/Excel'),

  -- Payroll
  ('payroll',       'view',                    'View Payroll',                 'View salary structures and payslips'),
  ('payroll',       'generate',                'Generate Payroll',             'Generate payslips for employees'),
  ('payroll',       'export',                  'Export Payroll',               'Export payroll data to CSV/Excel'),
  ('payroll',       'lock',                    'Lock Payroll',                 'Lock and freeze payroll runs'),
  ('payroll',       'manage_structures',       'Manage Salary Structures',     'Create and edit salary structures'),
  ('payroll',       'manage_adjustments',      'Manage Adjustments',           'Add bonuses, penalties and advances'),

  -- Reports
  ('reports',       'view',                    'View Reports',                 'Access reports and analytics'),
  ('reports',       'export',                  'Export Reports',               'Export reports to CSV/Excel'),

  -- Settings
  ('settings',      'view',                    'View Settings',                'View organization settings'),
  ('settings',      'manage',                  'Manage Settings',              'Modify organization settings'),

  -- Documents
  ('documents',     'view',                    'View Documents',               'View uploaded documents'),
  ('documents',     'upload',                  'Upload Documents',             'Upload new documents'),
  ('documents',     'manage',                  'Manage Documents',             'Categorize, share and review documents'),
  ('documents',     'delete',                  'Delete Documents',             'Delete documents'),

  -- Onboarding
  ('onboarding',    'view',                    'View Onboarding',              'View onboarding checklists and status'),
  ('onboarding',    'manage',                  'Manage Onboarding',            'Initialize and manage onboarding tasks'),
  ('onboarding',    'complete_task',           'Complete Onboarding Task',     'Mark assigned onboarding tasks as complete'),

  -- Announcements
  ('announcements', 'view',                    'View Announcements',           'Read announcements'),
  ('announcements', 'create',                  'Create Announcements',         'Post new announcements'),
  ('announcements', 'manage',                  'Manage Announcements',         'Edit, pin and delete announcements'),

  -- Holidays
  ('holidays',      'view',                    'View Holidays',                'View holiday calendar'),
  ('holidays',      'create',                  'Create Holidays',              'Add holidays to the calendar'),
  ('holidays',      'manage',                  'Manage Holidays',              'Edit and delete holidays'),

  -- Shifts
  ('shifts',        'view',                    'View Shifts',                  'View shift definitions and assignments'),
  ('shifts',        'create',                  'Create Shifts',                'Create new shift definitions'),
  ('shifts',        'manage',                  'Manage Shifts',                'Edit shifts and manage roster assignments'),

  -- Biometric
  ('biometric',     'view',                    'View Biometric',               'View biometric devices and punch logs'),
  ('biometric',     'manage',                  'Manage Biometric',             'Configure devices and PIN mappings'),
  ('biometric',     'logs',                    'View Punch Logs',              'Access detailed biometric punch history'),

  -- Branches
  ('branches',      'view',                    'View Branches',                'View branch list'),
  ('branches',      'create',                  'Create Branches',              'Add new branches'),
  ('branches',      'manage',                  'Manage Branches',              'Edit and deactivate branches'),

  -- Assets
  ('assets',        'view',                    'View Assets',                  'View asset inventory'),
  ('assets',        'create',                  'Create Assets',                'Add new assets'),
  ('assets',        'manage',                  'Manage Assets',                'Edit and retire assets'),
  ('assets',        'assign',                  'Assign Assets',                'Assign assets to employees'),

  -- Expenses
  ('expenses',      'view',                    'View Expenses',                'View expense claims'),
  ('expenses',      'create',                  'Submit Expenses',              'Submit expense claims'),
  ('expenses',      'approve',                 'Approve Expenses',             'Approve or reject expense claims'),
  ('expenses',      'manage',                  'Manage Expenses',              'Full expense management access'),

  -- Performance
  ('performance',   'view',                    'View Performance',             'View performance goals and reviews'),
  ('performance',   'create',                  'Create Performance Goals',     'Set performance goals'),
  ('performance',   'manage',                  'Manage Performance',           'Create and review performance assessments'),

  -- Exit
  ('exit',          'view',                    'View Exit Requests',           'View resignation and exit requests'),
  ('exit',          'approve',                 'Approve Exit Requests',        'Approve or reject exit requests'),
  ('exit',          'manage',                  'Manage Exit Process',          'Full exit management including clearances'),

  -- Roles (RBAC)
  ('roles',         'view',                    'View Roles',                   'View role list and permissions'),
  ('roles',         'manage',                  'Manage Roles',                 'Create, edit and delete custom roles'),

  -- Notifications
  ('notifications', 'view',                    'View Notifications',           'Receive and read notifications'),
  ('notifications', 'broadcast',               'Broadcast Notifications',      'Send push notifications to employees')

ON CONFLICT (module_key, action) DO NOTHING;

INSERT INTO schema_migrations(version, description)
VALUES ('20260730_rbac_002', 'Seeded 77 permissions across 22 modules')
ON CONFLICT (version) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- SECTION 3: SEED SYSTEM ROLES PER ORG + ASSIGN PERMISSIONS
-- Iterates every active organization
-- Creates 4 system roles per org
-- Assigns permission sets to each role
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  org_rec          RECORD;
  root_role_id     BIGINT;
  hr_role_id       BIGINT;
  dh_role_id       BIGINT;
  emp_role_id      BIGINT;
BEGIN

  -- Fix M1: Only seed active/pending orgs. Suspended/inactive orgs don't need roles.
  FOR org_rec IN
    SELECT id FROM organizations WHERE status IN ('active', 'pending')
  LOOP

    -- Insert system roles (slug is the stable identifier)
    INSERT INTO roles (org_id, name, slug, description, is_system_role)
    VALUES
      (org_rec.id, 'Root Admin',       'root_admin', 'Full system access. Can manage all modules, roles and settings.',              true),
      (org_rec.id, 'HR Admin',         'hr_admin',   'HR management access. Can manage employees, attendance, leaves and payroll.',  true),
      (org_rec.id, 'Department Head',  'dept_head',  'Department-level access. Can forward leaves and view team data.',              true),
      (org_rec.id, 'Employee',         'employee',   'Standard employee access. Self-service only.',                                 true)
    ON CONFLICT (org_id, slug) DO NOTHING;

    -- Fetch role IDs (may exist from a previous run)
    SELECT id INTO root_role_id FROM roles WHERE org_id = org_rec.id AND slug = 'root_admin';
    SELECT id INTO hr_role_id   FROM roles WHERE org_id = org_rec.id AND slug = 'hr_admin';
    SELECT id INTO dh_role_id   FROM roles WHERE org_id = org_rec.id AND slug = 'dept_head';
    SELECT id INTO emp_role_id  FROM roles WHERE org_id = org_rec.id AND slug = 'employee';

    -- ── Root Admin: ALL permissions ───────────────────────────────────────────
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT root_role_id, p.id
    FROM permissions p
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- ── HR Admin permissions ──────────────────────────────────────────────────
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT hr_role_id, p.id
    FROM permissions p
    WHERE (p.module_key, p.action) IN (
      ('dashboard',     'view'),
      ('employees',     'view'),
      ('employees',     'create'),
      ('employees',     'edit'),
      ('employees',     'delete'),
      ('employees',     'export'),
      ('departments',   'view'),
      ('departments',   'create'),
      ('departments',   'edit'),
      ('departments',   'delete'),
      ('designations',  'view'),
      ('designations',  'manage'),
      ('attendance',    'view'),
      ('attendance',    'edit'),
      ('attendance',    'export'),
      ('attendance',    'approve_regularization'),
      ('leaves',        'view'),
      ('leaves',        'approve'),
      ('leaves',        'reject'),
      ('leaves',        'export'),
      ('payroll',       'view'),
      ('payroll',       'generate'),
      ('payroll',       'export'),
      ('payroll',       'lock'),
      ('payroll',       'manage_structures'),
      ('payroll',       'manage_adjustments'),
      ('reports',       'view'),
      ('reports',       'export'),
      ('settings',      'view'),
      ('settings',      'manage'),
      ('documents',     'view'),
      ('documents',     'upload'),
      ('documents',     'manage'),
      ('documents',     'delete'),
      ('onboarding',    'view'),
      ('onboarding',    'manage'),
      ('onboarding',    'complete_task'),
      ('announcements', 'view'),
      ('announcements', 'create'),
      ('announcements', 'manage'),
      ('holidays',      'view'),
      ('holidays',      'create'),
      ('holidays',      'manage'),
      ('shifts',        'view'),
      ('shifts',        'create'),
      ('shifts',        'manage'),
      ('biometric',     'view'),
      ('branches',      'view'),
      ('assets',        'view'),
      ('assets',        'create'),
      ('assets',        'manage'),
      ('assets',        'assign'),
      ('expenses',      'view'),
      ('expenses',      'approve'),
      ('expenses',      'manage'),
      ('performance',   'view'),
      ('performance',   'create'),
      ('performance',   'manage'),
      ('exit',          'view'),
      ('exit',          'approve'),
      ('exit',          'manage'),
      ('roles',         'view'),
      ('notifications', 'view'),
      ('notifications', 'broadcast')
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- ── Department Head permissions ────────────────────────────────────────────
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT dh_role_id, p.id
    FROM permissions p
    WHERE (p.module_key, p.action) IN (
      ('dashboard',     'view'),
      ('employees',     'view'),
      ('departments',   'view'),
      ('attendance',    'view'),
      ('leaves',        'view'),
      ('leaves',        'forward'),
      ('documents',     'view'),
      ('announcements', 'view'),
      ('holidays',      'view'),
      ('onboarding',    'view'),
      ('performance',   'view'),
      ('expenses',      'view'),
      ('reports',       'view'),
      ('notifications', 'view')
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- ── Employee permissions ──────────────────────────────────────────────────
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT emp_role_id, p.id
    FROM permissions p
    WHERE (p.module_key, p.action) IN (
      ('dashboard',     'view'),
      ('attendance',    'view'),
      ('leaves',        'view'),
      ('leaves',        'create'),
      ('documents',     'view'),
      ('documents',     'upload'),
      ('announcements', 'view'),
      ('holidays',      'view'),
      ('expenses',      'view'),
      ('expenses',      'create'),
      ('performance',   'view'),
      ('performance',   'create'),
      ('onboarding',    'view'),
      ('onboarding',    'complete_task'),
      ('notifications', 'view')
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

  END LOOP;

  RAISE NOTICE 'System roles seeded for all organizations';
END $$;

INSERT INTO schema_migrations(version, description)
VALUES ('20260730_rbac_003', 'Seeded system roles and permissions for all existing organizations')
ON CONFLICT (version) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: MAP EXISTING USERS TO SYSTEM ROLES
-- Maps users.role string → RBAC role in user_roles
-- Mapping: root_admin → root_admin slug
--          admin      → hr_admin slug
--          employee   → employee slug
-- platform_admin users are excluded (they are not org users)
-- ─────────────────────────────────────────────────────────────

INSERT INTO user_roles (user_id, role_id, org_id)
SELECT
  u.id                AS user_id,
  r.id                AS role_id,
  u.organization_id   AS org_id
FROM users u
JOIN roles r
  ON  r.org_id = u.organization_id
  AND r.slug = CASE u.role
    WHEN 'root_admin' THEN 'root_admin'
    WHEN 'admin'      THEN 'hr_admin'
    WHEN 'employee'   THEN 'employee'
    ELSE NULL
  END
WHERE u.role IN ('root_admin', 'admin', 'employee')
  AND u.organization_id IS NOT NULL
ON CONFLICT (user_id, role_id, org_id) DO NOTHING;

INSERT INTO schema_migrations(version, description)
VALUES ('20260730_rbac_004', 'Mapped all existing users to RBAC system roles via user_roles')
ON CONFLICT (version) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- SECTION 5: VERIFICATION QUERIES
-- Run after COMMIT to confirm seeding succeeded
-- ─────────────────────────────────────────────────────────────

COMMIT;

-- How many permissions were seeded?
SELECT COUNT(*) AS total_permissions FROM permissions;

-- How many system roles per org?
SELECT org_id, COUNT(*) AS system_role_count
FROM roles WHERE is_system_role = true
GROUP BY org_id ORDER BY org_id;

-- How many users were mapped?
SELECT COUNT(*) AS total_user_role_mappings FROM user_roles;

-- Permissions per system role (spot check: first active org):
-- Fix M2: don't hardcode org_id=1 — use the first seeded org dynamically
SELECT r.org_id, r.name AS role_name, COUNT(rp.id) AS permission_count
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
WHERE r.is_system_role = true
GROUP BY r.org_id, r.name ORDER BY r.org_id, permission_count DESC
LIMIT 20;
