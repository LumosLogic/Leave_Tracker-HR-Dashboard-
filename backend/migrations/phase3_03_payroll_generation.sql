-- Phase 3.3 — Payroll Generation Engine
-- Idempotent: safe to re-run. No destructive changes to existing tables.

BEGIN;

-- ── 1. Payroll Runs ───────────────────────────────────────────────────────────
-- One row per organisation per pay period. Tracks generation lifecycle.
CREATE TABLE IF NOT EXISTS payroll_runs (
    id                BIGSERIAL PRIMARY KEY,
    organization_id   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    month             INT    NOT NULL CHECK (month BETWEEN 1 AND 12),
    year              INT    NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    status            TEXT   NOT NULL DEFAULT 'draft'
                             CHECK (status IN (
                                 'draft','processing','completed',
                                 'completed_with_errors','failed','locked'
                             )),
    generated_by      BIGINT REFERENCES users(id),
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    employee_count    INT    NOT NULL DEFAULT 0,
    total_gross       NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_deductions  NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_net         NUMERIC(16,2) NOT NULL DEFAULT 0,
    error_count       INT    NOT NULL DEFAULT 0,
    locked_by         BIGINT REFERENCES users(id),
    locked_at         TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_payroll_run_period UNIQUE (organization_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org
    ON payroll_runs(organization_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status
    ON payroll_runs(organization_id, status);

-- ── 2. Payroll Run Employees ──────────────────────────────────────────────────
-- One row per employee per payroll run. Tracks success / failure per person.
CREATE TABLE IF NOT EXISTS payroll_run_employees (
    id              BIGSERIAL PRIMARY KEY,
    payroll_run_id  BIGINT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    organization_id BIGINT NOT NULL REFERENCES organizations(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    payslip_id      BIGINT,   -- FK added after payslips is altered
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','success','failed','skipped')),
    error_message   TEXT,
    processed_at    TIMESTAMPTZ,

    CONSTRAINT uq_pre_run_user UNIQUE (payroll_run_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pre_run_id  ON payroll_run_employees(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_pre_org_user ON payroll_run_employees(organization_id, user_id);

-- ── 3. Extend payslips table ──────────────────────────────────────────────────
-- All ALTER TABLE are additive and idempotent via IF NOT EXISTS.
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payroll_run_id       BIGINT;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS locked               BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS locked_at            TIMESTAMPTZ;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS locked_by            BIGINT;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS formula_version      TEXT        DEFAULT '3.3';
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS salary_structure_id  BIGINT;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS attendance_snapshot  JSONB;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS lop_snapshot         JSONB;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS special_allowance    NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Add FKs after both tables exist (idempotent via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'fk_payslips_run'
           AND table_name = 'payslips'
    ) THEN
        ALTER TABLE payslips
            ADD CONSTRAINT fk_payslips_run
            FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'fk_pre_payslip'
           AND table_name = 'payroll_run_employees'
    ) THEN
        ALTER TABLE payroll_run_employees
            ADD CONSTRAINT fk_pre_payslip
            FOREIGN KEY (payslip_id) REFERENCES payslips(id);
    END IF;
END;
$$;

-- ── 4. Indexes on payslips for run lookups ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payslips_run_id
    ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_org_period
    ON payslips(organization_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payslips_locked
    ON payslips(organization_id)
    WHERE locked = TRUE;

-- ── 5. Expand payroll_audit_log entity_type ───────────────────────────────────
-- Drop ALL check constraints on entity_type (auto-names vary), then re-add.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT tc.constraint_name
          FROM information_schema.table_constraints tc
         WHERE tc.table_name     = 'payroll_audit_log'
           AND tc.constraint_type = 'CHECK'
           AND tc.constraint_name  ILIKE '%entity_type%'
    LOOP
        EXECUTE 'ALTER TABLE payroll_audit_log DROP CONSTRAINT IF EXISTS "' || rec.constraint_name || '"';
    END LOOP;

    ALTER TABLE payroll_audit_log
        ADD CONSTRAINT payroll_audit_log_entity_type_check
        CHECK (entity_type IN ('salary_structure', 'payroll_settings', 'payslip', 'payroll_run'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$;

-- ── 6. Missing payroll permissions ────────────────────────────────────────────
-- Phase 3.1 only seeded manage_structures/settings/view_payslips/email_payslips/lock.
-- These are needed by Phase 3.3 routes and seedSystemRolesForOrg grants.
INSERT INTO permissions (module_key, action, label, description)
VALUES
    ('payroll', 'view',               'View Payroll',          'View payroll runs and payslip summaries'),
    ('payroll', 'generate',           'Generate Payroll',      'Trigger payroll runs for a pay period'),
    ('payroll', 'export',             'Export Payroll',        'Export payroll data to CSV/Excel'),
    ('payroll', 'unlock',             'Unlock Payroll',        'Unlock a locked payroll run (Root Admin only)'),
    ('payroll', 'download',           'Download Payslips',     'Download individual payslip documents'),
    ('payroll', 'manage_adjustments', 'Manage Adjustments',    'Add ad-hoc salary adjustments to payroll')
ON CONFLICT (module_key, action) DO NOTHING;

-- Back-fill grants for existing hr_admin roles in all orgs
DO $$
DECLARE
    rec       RECORD;
    v_role_id BIGINT;
    v_perm_id BIGINT;
BEGIN
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'hr_admin' LOOP
        SELECT id INTO v_role_id FROM roles
         WHERE org_id = rec.org_id AND slug = 'hr_admin' LIMIT 1;
        IF v_role_id IS NULL THEN CONTINUE; END IF;

        FOR v_perm_id IN
            SELECT id FROM permissions
             WHERE module_key = 'payroll'
               AND action IN ('view', 'generate', 'export', 'download', 'manage_adjustments',
                              'manage_structures', 'manage_settings', 'view_payslips',
                              'email_payslips', 'lock')
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END LOOP;

    -- Root admin: grant all payroll permissions including unlock
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'root_admin' LOOP
        SELECT id INTO v_role_id FROM roles
         WHERE org_id = rec.org_id AND slug = 'root_admin' LIMIT 1;
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

-- ── 7. Version tracking ───────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description) VALUES
    ('20260730_phase3_301', 'Created payroll_runs table with status lifecycle'),
    ('20260730_phase3_302', 'Created payroll_run_employees per-employee tracking'),
    ('20260730_phase3_303', 'Extended payslips with snapshot, lock, and run FK columns'),
    ('20260730_phase3_304', 'Added payroll generation indexes and audit log expansion')
ON CONFLICT (version) DO NOTHING;

-- Verification
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'payroll_runs'
 ORDER BY ordinal_position;

COMMIT;
