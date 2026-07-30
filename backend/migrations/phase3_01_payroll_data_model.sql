-- Phase 3.1 — Payroll Data Model & Salary Structure
-- Idempotent: safe to re-run. No destructive changes to existing tables.

BEGIN;

-- ── 0. Migration tracking ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    description TEXT,
    applied_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 1. Payroll Settings (org-level) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_settings (
    id                           BIGSERIAL PRIMARY KEY,
    organization_id              BIGINT NOT NULL
                                     REFERENCES organizations(id) ON DELETE CASCADE,

    -- Cycle
    payroll_cycle                TEXT    NOT NULL DEFAULT 'monthly'
                                         CHECK (payroll_cycle IN ('monthly')),
    payroll_date                 INT     NOT NULL DEFAULT 1
                                         CHECK (payroll_date BETWEEN 1 AND 28),

    -- Working days
    working_days_rule            TEXT    NOT NULL DEFAULT 'calendar'
                                         CHECK (working_days_rule IN ('calendar','fixed')),
    fixed_working_days           INT     NOT NULL DEFAULT 26
                                         CHECK (fixed_working_days BETWEEN 1 AND 31),
    weekend_policy               TEXT    NOT NULL DEFAULT 'sat_sun'
                                         CHECK (weekend_policy IN ('sat_sun','sun_only','none','alternate_sat')),
    count_holidays_as_paid       BOOLEAN NOT NULL DEFAULT TRUE,

    -- Attendance rules
    grace_minutes                INT     NOT NULL DEFAULT 15
                                         CHECK (grace_minutes BETWEEN 0 AND 60),
    late_allowance_per_month     INT     NOT NULL DEFAULT 3
                                         CHECK (late_allowance_per_month BETWEEN 0 AND 31),
    early_exit_allowance_minutes INT     NOT NULL DEFAULT 30
                                         CHECK (early_exit_allowance_minutes BETWEEN 0 AND 120),
    half_day_after_lates         INT     NOT NULL DEFAULT 3
                                         CHECK (half_day_after_lates BETWEEN 1 AND 10),
    lop_after_half_days          INT     NOT NULL DEFAULT 2
                                         CHECK (lop_after_half_days BETWEEN 1 AND 10),

    -- Statutory toggles
    pf_enabled                   BOOLEAN NOT NULL DEFAULT TRUE,
    esi_enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
    professional_tax_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    tds_enabled                  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Automation
    payslip_auto_email           BOOLEAN NOT NULL DEFAULT TRUE,
    auto_generate_payroll        BOOLEAN NOT NULL DEFAULT FALSE,

    updated_by                   BIGINT  REFERENCES users(id),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_payroll_settings_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_settings_org
    ON payroll_settings(organization_id);

-- ── 2. Employee Salary Structures (versioned) ─────────────────────────────────
-- History is never lost. Changing salary closes the current version (sets
-- effective_to) and inserts a new one. Old payslips reference their snapshot.

CREATE TABLE IF NOT EXISTS employee_salary_structures (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL
                            REFERENCES organizations(id) ON DELETE CASCADE,
    user_id             BIGINT NOT NULL
                            REFERENCES users(id) ON DELETE CASCADE,

    effective_from      DATE NOT NULL,
    effective_to        DATE,           -- NULL = currently active version

    -- Earnings
    basic               NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic >= 0),
    hra                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (hra >= 0),
    da                  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (da >= 0),
    transport_allowance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
    medical_allowance   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (medical_allowance >= 0),
    special_allowance   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (special_allowance >= 0),
    other_allowance     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
    gross_salary        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_salary >= 0),

    -- Employee statutory deductions
    employee_pf         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (employee_pf >= 0),
    employee_esi        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (employee_esi >= 0),
    professional_tax    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (professional_tax >= 0),
    tds                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tds >= 0),
    other_deductions    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),

    -- Employer contributions (for CTC calculation, not deducted from employee)
    employer_pf         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (employer_pf >= 0),
    employer_esi        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (employer_esi >= 0),

    ctc                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (ctc >= 0),

    notes               TEXT,
    created_by          BIGINT REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ess_date_range
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Only one active salary (effective_to IS NULL) per employee per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_ess_active_per_employee
    ON employee_salary_structures(organization_id, user_id)
    WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_ess_user_org_date
    ON employee_salary_structures(organization_id, user_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_ess_org_active
    ON employee_salary_structures(organization_id)
    WHERE effective_to IS NULL;

-- ── 3. Payroll Audit Log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL
                        REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id        BIGINT REFERENCES users(id),
    actor_name      TEXT,
    action          TEXT NOT NULL CHECK (action IN (
                        'salary_created', 'salary_updated', 'salary_deactivated',
                        'settings_updated',
                        'payroll_generated', 'payroll_regenerated',
                        'payroll_locked', 'payroll_unlocked',
                        'payslip_emailed'
                    )),
    entity_type     TEXT NOT NULL CHECK (entity_type IN (
                        'salary_structure', 'payroll_settings', 'payslip'
                    )),
    entity_id       BIGINT,
    target_user_id  BIGINT REFERENCES users(id),
    old_values      JSONB,
    new_values      JSONB,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pal_org_created
    ON payroll_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_entity
    ON payroll_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pal_target_user
    ON payroll_audit_log(target_user_id);

-- ── 4. Expand Permissions Catalog ────────────────────────────────────────────
INSERT INTO permissions (module_key, action, label, description)
VALUES
    ('payroll', 'manage_structures', 'Manage Salary Structures', 'Create and update employee salary structures'),
    ('payroll', 'manage_settings',   'Manage Payroll Settings',  'Configure org-level payroll rules and cycles'),
    ('payroll', 'view_payslips',     'View All Payslips',        'View payslips for all employees in the org'),
    ('payroll', 'email_payslips',    'Email Payslips',           'Manually trigger payslip email delivery'),
    ('payroll', 'lock',              'Lock Payslips',            'Lock and unlock processed payslips')
ON CONFLICT (module_key, action) DO NOTHING;

-- Grant new payroll permissions to system roles across all orgs
DO $$
DECLARE
    rec       RECORD;
    v_role_id BIGINT;
    v_perm_id BIGINT;
BEGIN
    -- hr_admin: full payroll management
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'hr_admin' LOOP
        SELECT id INTO v_role_id FROM roles
         WHERE org_id = rec.org_id AND slug = 'hr_admin';
        IF v_role_id IS NULL THEN CONTINUE; END IF;

        FOR v_perm_id IN
            SELECT id FROM permissions
             WHERE module_key = 'payroll'
               AND action IN (
                   'view', 'generate', 'export',
                   'manage_structures', 'manage_settings',
                   'view_payslips', 'email_payslips', 'lock'
               )
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END LOOP;

    -- root_admin: all payroll permissions
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'root_admin' LOOP
        SELECT id INTO v_role_id FROM roles
         WHERE org_id = rec.org_id AND slug = 'root_admin';
        IF v_role_id IS NULL THEN CONTINUE; END IF;

        FOR v_perm_id IN
            SELECT id FROM permissions WHERE module_key = 'payroll'
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$;

-- ── 5. Version Tracking ───────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description) VALUES
    ('20260730_phase3_001', 'Created payroll_settings table'),
    ('20260730_phase3_002', 'Created employee_salary_structures table with versioning'),
    ('20260730_phase3_003', 'Created payroll_audit_log table'),
    ('20260730_phase3_004', 'Seeded payroll permissions and role_permissions for hr_admin/root_admin')
ON CONFLICT (version) DO NOTHING;

-- Verify
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'employee_salary_structures'
  AND column_name IN ('effective_from','effective_to','gross_salary','ctc')
ORDER BY ordinal_position;

COMMIT;
