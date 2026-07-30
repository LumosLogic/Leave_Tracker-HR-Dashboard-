-- Phase 3.5 — Payroll Automation (Multi-Tenant Configurable Scheduler)
-- Idempotent: safe to re-run. All changes are additive.
-- Preserves every column from Phase 3.1 / Phase 3.3 / Phase 3.4 migrations.

BEGIN;

-- ── 1. Extend payroll_settings — existing columns (Phase 3.5 original) ────────
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS timezone     TEXT    NOT NULL DEFAULT 'Asia/Kolkata';

-- ── 2. Extend payroll_settings — per-org schedule columns (multi-tenant) ──────
--
-- payroll_generation_day:  Day of month to generate payroll.
--   Accepts: '1'–'28', 'LAST_DAY' (last calendar day), 'LAST_WORKING_DAY'.
--   If NULL, falls back to the legacy payroll_date INT column.
--
-- payroll_generation_time: Time (HH:MM, 24h) at or after which the scheduler
--   is allowed to generate. The scheduler checks every hour; if current hour >=
--   this value AND it is the correct day, generation proceeds.
--
-- payroll_generate_for: Which month's payroll to generate.
--   'PREVIOUS' = month before the generation day's month (standard post-period).
--   'CURRENT'  = same month as the generation day (advance/early salary).
--
-- payroll_publish_day:   Day of month to auto-publish generated payslips.
--   Same format as payroll_generation_day. Can be same day or a later day.
--   Publish is independent of generation — it finds completed-but-unpublished runs.
--
-- payroll_publish_time:  Time (HH:MM) at or after which auto-publish runs.
--
-- payroll_payout_day:    Informational only — when salary is actually credited.
--   Stored so HR can display expected credit date to employees.
--
-- payroll_payout_time:   Informational only.

ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payroll_generation_day  TEXT;
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payroll_generation_time TEXT NOT NULL DEFAULT '01:00';
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payroll_generate_for    TEXT NOT NULL DEFAULT 'PREVIOUS'
    CHECK (payroll_generate_for IN ('PREVIOUS', 'CURRENT'));
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payroll_publish_day     TEXT;
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payroll_publish_time    TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payroll_payout_day      TEXT;
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payroll_payout_time     TEXT;

-- ── 3. Payroll Scheduler Run Tracking ─────────────────────────────────────────
-- One row per org per pay period — the UNIQUE constraint is the distributed mutex
-- that prevents duplicate automated generation across multiple server instances.
-- Manual triggers use ON CONFLICT DO UPDATE to overwrite stale records.
CREATE TABLE IF NOT EXISTS payroll_scheduler_runs (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    run_date         DATE   NOT NULL,
    pay_month        INT    NOT NULL CHECK (pay_month BETWEEN 1 AND 12),
    pay_year         INT    NOT NULL CHECK (pay_year  BETWEEN 2000 AND 2100),
    triggered_by     TEXT   NOT NULL DEFAULT 'scheduler'
                            CHECK (triggered_by IN ('scheduler', 'manual')),
    triggered_actor  TEXT,
    status           TEXT   NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
    payroll_run_id   BIGINT REFERENCES payroll_runs(id),
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,

    CONSTRAINT uq_psr_org_period UNIQUE (organization_id, pay_month, pay_year)
);

CREATE INDEX IF NOT EXISTS idx_psr_org_created ON payroll_scheduler_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_psr_status      ON payroll_scheduler_runs(status) WHERE status = 'running';

-- ── 4. Payroll Email Log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_email_log (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    payroll_run_id   BIGINT REFERENCES payroll_runs(id),
    payslip_id       BIGINT REFERENCES payslips(id),
    user_id          BIGINT NOT NULL REFERENCES users(id),
    email_address    TEXT   NOT NULL,
    status           TEXT   NOT NULL DEFAULT 'sent'
                            CHECK (status IN ('sent', 'failed', 'skipped')),
    error_message    TEXT,
    sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pel_org_run ON payroll_email_log(organization_id, payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_pel_user    ON payroll_email_log(user_id);

-- ── 5. Expand payroll_audit_log action constraint ─────────────────────────────
DO $$
BEGIN
    ALTER TABLE payroll_audit_log DROP CONSTRAINT IF EXISTS payroll_audit_log_action_check;
    ALTER TABLE payroll_audit_log
        ADD CONSTRAINT payroll_audit_log_action_check
        CHECK (action IN (
            'salary_created',        'salary_updated',    'salary_deactivated',
            'settings_updated',
            'payroll_generated',     'payroll_regenerated',
            'payroll_locked',        'payroll_unlocked',
            'payslip_emailed',       'payslip_published',
            'payroll_auto_generated'
        ));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ── 6. Version tracking ───────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description) VALUES
    ('20260730_phase3_501', 'Added auto_publish and timezone to payroll_settings'),
    ('20260730_phase3_502', 'Created payroll_scheduler_runs table for run tracking'),
    ('20260730_phase3_503', 'Created payroll_email_log table for email tracking'),
    ('20260730_phase3_504', 'Extended payroll_audit_log action constraint'),
    ('20260730_phase3_505', 'Added per-org schedule columns to payroll_settings (multi-tenant)')
ON CONFLICT (version) DO NOTHING;

COMMIT;
