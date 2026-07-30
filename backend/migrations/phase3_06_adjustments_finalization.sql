-- Phase 3.6 — Payroll Adjustments & Finalization
-- Idempotent: safe to re-run. All changes are additive.
-- Depends on: phase3_01, phase3_03, phase3_04, phase3_05

BEGIN;

-- ── 1. Extend payroll_runs status lifecycle ────────────────────────────────────
-- Current: draft | processing | completed | completed_with_errors | failed | locked
-- New   : + verified | approved | paid
DO $$
BEGIN
    ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
    ALTER TABLE payroll_runs
        ADD CONSTRAINT payroll_runs_status_check
        CHECK (status IN (
            'draft', 'processing',
            'completed', 'completed_with_errors', 'failed',
            'verified', 'approved', 'locked', 'paid'
        ));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Lifecycle tracking columns (one-way transitions; never reset)
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS verified_by    BIGINT REFERENCES users(id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS verified_at    TIMESTAMPTZ;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_by    BIGINT REFERENCES users(id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS paid_by        BIGINT REFERENCES users(id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_adjustments NUMERIC(16,2) NOT NULL DEFAULT 0;

-- ── 2. payroll_adjustments ─────────────────────────────────────────────────────
-- Multiple adjustments per employee per payroll run.
-- Soft-deleted via deleted_at (never physically removed for audit).
CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payroll_run_id      BIGINT REFERENCES payroll_runs(id) ON DELETE SET NULL,
    payslip_id          BIGINT REFERENCES payslips(id)    ON DELETE SET NULL,
    user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Type / category
    adjustment_type     TEXT NOT NULL DEFAULT 'one_time'
                            CHECK (adjustment_type IN ('one_time', 'recurring')),
    adjustment_category TEXT NOT NULL
                            CHECK (adjustment_category IN (
                                'BONUS', 'INCENTIVE', 'COMMISSION', 'OVERTIME',
                                'REIMBURSEMENT', 'ARREARS',
                                'ADVANCE_RECOVERY', 'LOAN_EMI', 'PENALTY',
                                'DEDUCTION', 'OTHER'
                            )),

    -- Amount & direction
    amount              NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    addition_or_deduction TEXT NOT NULL DEFAULT 'addition'
                            CHECK (addition_or_deduction IN ('addition', 'deduction')),

    -- Effective period (may differ from the run's month/year for arrears etc.)
    effective_month     INT  NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
    effective_year      INT  NOT NULL CHECK (effective_year  BETWEEN 2000 AND 2100),

    remarks             TEXT,

    -- Audit trail
    created_by          BIGINT NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,          -- NULL = active; NOT NULL = soft-deleted
    deleted_by          BIGINT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pa_org_run    ON payroll_adjustments(organization_id, payroll_run_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pa_org_user   ON payroll_adjustments(organization_id, user_id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pa_org_period ON payroll_adjustments(organization_id, effective_year, effective_month) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pa_payslip    ON payroll_adjustments(payslip_id)                      WHERE deleted_at IS NULL;

-- ── 3. payroll_attendance_overrides ───────────────────────────────────────────
-- HR can correct attendance counters without modifying raw attendance records.
-- One override per employee per payroll run.
CREATE TABLE IF NOT EXISTS payroll_attendance_overrides (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payroll_run_id      BIGINT NOT NULL REFERENCES payroll_runs(id)  ON DELETE CASCADE,
    user_id             BIGINT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,

    -- Engine-calculated originals (frozen at override creation time)
    original_present_days NUMERIC(5,1),
    original_absent_days  NUMERIC(5,1),
    original_paid_days    NUMERIC(5,1),
    original_half_days    NUMERIC(5,1),
    original_lop_days     NUMERIC(5,1),
    original_late_count   INT,

    -- HR-supplied overrides (NULL = keep original)
    override_present_days NUMERIC(5,1),
    override_absent_days  NUMERIC(5,1),
    override_paid_days    NUMERIC(5,1),
    override_half_days    NUMERIC(5,1),
    override_lop_days     NUMERIC(5,1),
    override_late_count   INT,

    reason              TEXT NOT NULL,
    approved_by         BIGINT REFERENCES users(id),
    approved_at         TIMESTAMPTZ,

    created_by          BIGINT NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_pao_run_user UNIQUE (payroll_run_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pao_org_run  ON payroll_attendance_overrides(organization_id, payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_pao_org_user ON payroll_attendance_overrides(organization_id, user_id);

-- ── 4. Extend payslips with adjustment totals ─────────────────────────────────
-- adjustment_total: net signed effect of all active adjustments on this payslip.
-- effective_net = net_salary + adjustment_total (computed at query time or stored here).
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS adjustment_total NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS has_override     BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 5. New Permissions ─────────────────────────────────────────────────────────
INSERT INTO permissions (module_key, action, label, description)
VALUES
    ('payroll', 'verify',           'Verify Payroll',         'Mark a completed payroll run as HR-verified'),
    ('payroll', 'approve',          'Approve Payroll',        'Root Admin approval before locking/payment'),
    ('payroll', 'mark_paid',        'Mark Payroll Paid',      'Record that salary has been credited to employees'),
    ('payroll', 'run_reports',      'Run Payroll Reports',    'Generate payroll summary and detailed reports'),
    ('payroll', 'bank_files',       'Generate Bank Files',    'Generate bank transfer files (HDFC, ICICI, SBI, etc.)'),
    ('payroll', 'manage_overrides', 'Manage Attendance Overrides', 'Override attendance data before payroll generation')
ON CONFLICT (module_key, action) DO NOTHING;

-- ── 6. Extend audit log constraints ───────────────────────────────────────────
DO $$
BEGIN
    ALTER TABLE payroll_audit_log DROP CONSTRAINT IF EXISTS payroll_audit_log_action_check;
    ALTER TABLE payroll_audit_log
        ADD CONSTRAINT payroll_audit_log_action_check
        CHECK (action IN (
            'salary_created',      'salary_updated',     'salary_deactivated',
            'settings_updated',
            'payroll_generated',   'payroll_regenerated',
            'payroll_locked',      'payroll_unlocked',
            'payslip_emailed',     'payslip_published',
            'payroll_auto_generated',
            'payroll_verified',    'payroll_approved',   'payroll_paid',
            'adjustment_added',    'adjustment_updated', 'adjustment_deleted',
            'override_added',      'override_deleted',
            'report_exported',     'bank_file_generated'
        ));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
    ALTER TABLE payroll_audit_log DROP CONSTRAINT IF EXISTS payroll_audit_log_entity_type_check;
    ALTER TABLE payroll_audit_log
        ADD CONSTRAINT payroll_audit_log_entity_type_check
        CHECK (entity_type IN (
            'salary_structure', 'payroll_settings', 'payslip',
            'payroll_run', 'adjustment', 'override', 'report'
        ));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ── 7. Back-fill role permissions for new Phase 3.6 permissions ───────────────
DO $$
DECLARE
    rec       RECORD;
    v_role_id BIGINT;
    v_perm_id BIGINT;
BEGIN
    -- hr_admin: verify, run_reports, bank_files, manage_overrides, manage_adjustments
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'hr_admin' LOOP
        SELECT id INTO v_role_id FROM roles
         WHERE org_id = rec.org_id AND slug = 'hr_admin' LIMIT 1;
        IF v_role_id IS NULL THEN CONTINUE; END IF;

        FOR v_perm_id IN
            SELECT id FROM permissions
             WHERE module_key = 'payroll'
               AND action IN ('verify', 'run_reports', 'bank_files', 'manage_overrides', 'manage_adjustments')
        LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END LOOP;

    -- root_admin: all payroll permissions
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

-- ── 8. Version tracking ────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description) VALUES
    ('20260730_phase3_601', 'Extended payroll_runs status lifecycle (verified, approved, paid)'),
    ('20260730_phase3_602', 'Created payroll_adjustments table with soft-delete and audit'),
    ('20260730_phase3_603', 'Created payroll_attendance_overrides table'),
    ('20260730_phase3_604', 'Added adjustment_total and has_override to payslips'),
    ('20260730_phase3_605', 'Seeded Phase 3.6 permissions and back-filled role grants'),
    ('20260730_phase3_606', 'Extended payroll_audit_log action and entity_type constraints')
ON CONFLICT (version) DO NOTHING;

-- Verify
SELECT
    column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'payroll_adjustments'
 ORDER BY ordinal_position;

COMMIT;
