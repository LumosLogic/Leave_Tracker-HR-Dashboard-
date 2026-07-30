-- Phase 3.4 — Payroll Integration & Production Hardening
-- Idempotent: safe to re-run. All changes are additive.

BEGIN;

-- ── 1. Performance indexes ─────────────────────────────────────────────────────
-- payslips(user_id, organization_id) — heavily used by GET /payslips self-service
CREATE INDEX IF NOT EXISTS idx_payslips_user_org
    ON payslips(user_id, organization_id);

-- payslips(organization_id, status) — used by GET /payslips/all with status filter
CREATE INDEX IF NOT EXISTS idx_payslips_org_status
    ON payslips(organization_id, status);

-- payslips(user_id, month, year, organization_id) — covers the upsert conflict target
-- The existing UNIQUE(user_id, month, year) partial covers lookups within a user
-- but adding org gives the planner a better path for cross-org exclusion
CREATE INDEX IF NOT EXISTS idx_payslips_user_month_year_org
    ON payslips(user_id, month, year, organization_id);

-- employee_salary_structures — already indexed in phase3_01, ensure composite exists
CREATE INDEX IF NOT EXISTS idx_ess_org_user_dates
    ON employee_salary_structures(organization_id, user_id, effective_from DESC)
    WHERE effective_to IS NULL;

-- payroll_audit_log(actor_id) — admin audit queries filter by actor
CREATE INDEX IF NOT EXISTS idx_pal_actor
    ON payroll_audit_log(actor_id)
    WHERE actor_id IS NOT NULL;

-- ── 2. Extend payroll_audit_log action constraint ─────────────────────────────
-- Add 'payslip_published' so the publish action can be audited.
DO $$
BEGIN
    ALTER TABLE payroll_audit_log DROP CONSTRAINT IF EXISTS payroll_audit_log_action_check;
    ALTER TABLE payroll_audit_log
        ADD CONSTRAINT payroll_audit_log_action_check
        CHECK (action IN (
            'salary_created', 'salary_updated', 'salary_deactivated',
            'settings_updated',
            'payroll_generated', 'payroll_regenerated',
            'payroll_locked',    'payroll_unlocked',
            'payslip_emailed',   'payslip_published'
        ));
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$;

-- ── 3. Ensure payslips.organization_id is always populated ─────────────────────
-- Backfill any NULL organization_id rows by joining via users table.
-- Safe to run multiple times (WHERE org_id IS NULL).
UPDATE payslips ps
   SET organization_id = u.organization_id
  FROM users u
 WHERE ps.user_id         = u.id
   AND ps.organization_id IS NULL
   AND u.organization_id  IS NOT NULL;

-- ── 4. Ensure payslips.locked default exists ──────────────────────────────────
-- Phase 3.03 migration adds this column; some paths may not have set it.
-- Re-apply default for any rows that are NULL (shouldn't exist but guard anyway).
ALTER TABLE payslips ALTER COLUMN locked SET DEFAULT FALSE;

UPDATE payslips SET locked = FALSE WHERE locked IS NULL;

-- ── 5. Version tracking ───────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description) VALUES
    ('20260730_phase3_401', 'Added performance indexes on payslips for common query patterns'),
    ('20260730_phase3_402', 'Extended payroll_audit_log action constraint with payslip_published'),
    ('20260730_phase3_403', 'Backfilled payslips.organization_id and hardened locked column default')
ON CONFLICT (version) DO NOTHING;

COMMIT;
