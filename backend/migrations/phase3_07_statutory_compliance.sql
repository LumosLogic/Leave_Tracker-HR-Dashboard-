-- Phase 3.7 — Statutory Compliance (Indian Payroll)
-- Idempotent: safe to re-run. All changes are additive.
-- Depends on: phase3_01 through phase3_06

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. PROVIDENT FUND CONFIG
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_pf_config (
    id                      BIGSERIAL PRIMARY KEY,
    organization_id         BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled                 BOOLEAN NOT NULL DEFAULT TRUE,

    -- Employee PF
    employee_pf_pct         NUMERIC(5,2) NOT NULL DEFAULT 12.00,    -- % of PF wages
    -- Employer split
    employer_epf_pct        NUMERIC(5,2) NOT NULL DEFAULT 3.67,     -- Employer EPF (after EPS)
    employer_eps_pct        NUMERIC(5,2) NOT NULL DEFAULT 8.33,     -- Employer EPS
    -- Wage ceiling (INR/month); set to 0 to use actual wages (no ceiling)
    wage_ceiling            NUMERIC(10,2) NOT NULL DEFAULT 15000.00,
    -- PF wage basis
    pf_wage_basis           TEXT NOT NULL DEFAULT 'basic'
                                CHECK (pf_wage_basis IN ('basic', 'basic_da')),
    -- Voluntary PF: additional employee contribution above statutory
    vpf_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    vpf_pct                 NUMERIC(5,2) NOT NULL DEFAULT 0.00,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by              BIGINT REFERENCES users(id),

    CONSTRAINT uq_pf_config_org UNIQUE (organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ESI CONFIG
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_esi_config (
    id                      BIGSERIAL PRIMARY KEY,
    organization_id         BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled                 BOOLEAN NOT NULL DEFAULT TRUE,

    employee_esi_pct        NUMERIC(5,2) NOT NULL DEFAULT 0.75,
    employer_esi_pct        NUMERIC(5,2) NOT NULL DEFAULT 3.25,
    -- Auto-stop when gross exceeds this (INR/month); 0 = no limit check
    wage_limit              NUMERIC(10,2) NOT NULL DEFAULT 21000.00,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by              BIGINT REFERENCES users(id),

    CONSTRAINT uq_esi_config_org UNIQUE (organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. PROFESSIONAL TAX — STATE SLABS (seeded reference data)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_pt_slabs (
    id          BIGSERIAL PRIMARY KEY,
    state_code  TEXT NOT NULL,          -- 'KA', 'MH', 'GJ', etc.
    state_name  TEXT NOT NULL,
    -- slabs: JSON array of {from, to, monthly_pt, notes}
    -- 'to': null means no upper limit
    slabs       JSONB NOT NULL DEFAULT '[]',
    -- Some states collect annually (collected in a specific month)
    collection_months JSONB NOT NULL DEFAULT '[1,2,3,4,5,6,7,8,9,10,11,12]',
    effective_from DATE NOT NULL DEFAULT '2024-04-01',
    notes       TEXT,

    CONSTRAINT uq_pt_slabs_state UNIQUE (state_code)
);

-- Seed major Indian states (idempotent)
INSERT INTO statutory_pt_slabs (state_code, state_name, slabs, collection_months, notes) VALUES
(
    'KA', 'Karnataka',
    '[
        {"from": 0,     "to": 14999,  "monthly_pt": 0},
        {"from": 15000, "to": null,   "monthly_pt": 200, "feb_amount": 300}
    ]'::jsonb,
    '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
    'February PT is ₹300 (to make up annual ₹2400)'
),
(
    'MH', 'Maharashtra',
    '[
        {"from": 0,      "to": 7499,   "monthly_pt": 0},
        {"from": 7500,   "to": 9999,   "monthly_pt": 175},
        {"from": 10000,  "to": null,   "monthly_pt": 200, "feb_skip": true}
    ]'::jsonb,
    '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
    'February is exempt; annual ₹2400 spread over 11 months (₹200 × 11 + ₹0 Feb)'
),
(
    'GJ', 'Gujarat',
    '[
        {"from": 0,     "to": 5999,   "monthly_pt": 0},
        {"from": 6000,  "to": 8999,   "monthly_pt": 80},
        {"from": 9000,  "to": 11999,  "monthly_pt": 150},
        {"from": 12000, "to": null,   "monthly_pt": 200}
    ]'::jsonb,
    '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
    NULL
),
(
    'TN', 'Tamil Nadu',
    '[
        {"from": 0,      "to": null, "monthly_pt": 208}
    ]'::jsonb,
    '[4]'::jsonb,
    'Collected once annually in April (₹2500/year); monthly_pt shown as annual/12'
),
(
    'TS', 'Telangana',
    '[
        {"from": 0,      "to": 14999,  "monthly_pt": 0},
        {"from": 15000,  "to": null,   "monthly_pt": 200}
    ]'::jsonb,
    '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
    NULL
),
(
    'AP', 'Andhra Pradesh',
    '[
        {"from": 0,      "to": 14999,  "monthly_pt": 0},
        {"from": 15000,  "to": null,   "monthly_pt": 200}
    ]'::jsonb,
    '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
    NULL
),
(
    'WB', 'West Bengal',
    '[
        {"from": 0,     "to": 8499,   "monthly_pt": 0},
        {"from": 8500,  "to": 9999,   "monthly_pt": 90},
        {"from": 10000, "to": 14999,  "monthly_pt": 110},
        {"from": 15000, "to": 24999,  "monthly_pt": 130},
        {"from": 25000, "to": null,   "monthly_pt": 200}
    ]'::jsonb,
    '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
    NULL
),
(
    'MP', 'Madhya Pradesh',
    '[
        {"from": 0,     "to": null, "monthly_pt": 208}
    ]'::jsonb,
    '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb,
    'Approx ₹2500/year'
),
(
    'HR', 'Haryana',
    '[
        {"from": 0, "to": null, "monthly_pt": 0}
    ]'::jsonb,
    '[]'::jsonb,
    'PT not applicable in Haryana'
),
(
    'DL', 'Delhi',
    '[
        {"from": 0, "to": null, "monthly_pt": 0}
    ]'::jsonb,
    '[]'::jsonb,
    'PT not applicable in Delhi'
)
ON CONFLICT (state_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PT CONFIG (per organization — selects state)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_pt_config (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    state_code      TEXT NOT NULL DEFAULT 'KA',
    -- Override: if org has different slabs, store here (NULL = use state slabs)
    custom_slabs    JSONB,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      BIGINT REFERENCES users(id),

    CONSTRAINT uq_pt_config_org UNIQUE (organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TDS (INCOME TAX) CONFIG
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_tds_config (
    id                          BIGSERIAL PRIMARY KEY,
    organization_id             BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled                     BOOLEAN NOT NULL DEFAULT FALSE,

    -- Default regime for the org (employees can declare different)
    default_regime              TEXT NOT NULL DEFAULT 'new'
                                    CHECK (default_regime IN ('old', 'new')),
    -- Financial year start month (4 = April for India)
    fy_start_month              INT NOT NULL DEFAULT 4
                                    CHECK (fy_start_month BETWEEN 1 AND 12),
    -- Standard deduction (₹)
    standard_deduction_old      NUMERIC(12,2) NOT NULL DEFAULT 50000,
    standard_deduction_new      NUMERIC(12,2) NOT NULL DEFAULT 75000,
    -- 87A rebate threshold
    rebate_87a_threshold_old    NUMERIC(12,2) NOT NULL DEFAULT 500000,
    rebate_87a_threshold_new    NUMERIC(12,2) NOT NULL DEFAULT 700000,
    rebate_87a_max_old          NUMERIC(12,2) NOT NULL DEFAULT 12500,
    rebate_87a_max_new          NUMERIC(12,2) NOT NULL DEFAULT 25000,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by                  BIGINT REFERENCES users(id),

    CONSTRAINT uq_tds_config_org UNIQUE (organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. EMPLOYEE TAX DECLARATIONS (per FY)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_tds_declarations (
    id                      BIGSERIAL PRIMARY KEY,
    organization_id         BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    financial_year          TEXT NOT NULL,          -- e.g. '2024-25'

    -- Regime choice
    regime                  TEXT NOT NULL DEFAULT 'new'
                                CHECK (regime IN ('old', 'new')),

    -- Income from other sources / previous employer (INR annual)
    prev_employer_income    NUMERIC(14,2) NOT NULL DEFAULT 0,
    prev_employer_tds       NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_income            NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- Old-regime deductions (INR annual; only relevant if regime = 'old')
    deduction_80c           NUMERIC(14,2) NOT NULL DEFAULT 0,   -- max 150000
    deduction_80d_self      NUMERIC(14,2) NOT NULL DEFAULT 0,   -- max 25000
    deduction_80d_parents   NUMERIC(14,2) NOT NULL DEFAULT 0,   -- max 25000/50000
    deduction_80ccd         NUMERIC(14,2) NOT NULL DEFAULT 0,   -- NPS max 50000
    deduction_hra           NUMERIC(14,2) NOT NULL DEFAULT 0,
    deduction_home_loan     NUMERIC(14,2) NOT NULL DEFAULT 0,
    deduction_other         NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- HRA details (for HRA exemption calculation)
    hra_rent_paid_annual    NUMERIC(14,2) NOT NULL DEFAULT 0,
    hra_city_type           TEXT NOT NULL DEFAULT 'non_metro'
                                CHECK (hra_city_type IN ('metro', 'non_metro')),

    -- Workflow status
    status                  TEXT NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','submitted','hr_review','approved','rejected')),
    submitted_at            TIMESTAMPTZ,
    reviewed_by             BIGINT REFERENCES users(id),
    reviewed_at             TIMESTAMPTZ,
    reviewer_notes          TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tds_decl_user_fy UNIQUE (organization_id, user_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_tds_decl_org_fy ON statutory_tds_declarations(organization_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_tds_decl_user    ON statutory_tds_declarations(user_id, financial_year);
CREATE INDEX IF NOT EXISTS idx_tds_decl_status  ON statutory_tds_declarations(organization_id, status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. INVESTMENT PROOF DOCUMENTS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_investment_proofs (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    declaration_id      BIGINT NOT NULL REFERENCES statutory_tds_declarations(id) ON DELETE CASCADE,
    user_id             BIGINT NOT NULL REFERENCES users(id),

    proof_type          TEXT NOT NULL,  -- '80C_LIC', '80D_MEDICLAIM', 'HRA_RENT', 'HOME_LOAN', etc.
    description         TEXT NOT NULL,
    claimed_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    document_url        TEXT,           -- Cloudinary or local path
    document_name       TEXT,

    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','needs_reupload')),
    reviewed_by         BIGINT REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    rejection_reason    TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inv_proof_decl   ON statutory_investment_proofs(declaration_id);
CREATE INDEX IF NOT EXISTS idx_inv_proof_org_status ON statutory_investment_proofs(organization_id, status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. GRATUITY CONFIG
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_gratuity_config (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    -- Minimum service years for eligibility
    min_service_years   NUMERIC(4,1) NOT NULL DEFAULT 5.0,
    -- Gratuity wage basis
    wage_basis          TEXT NOT NULL DEFAULT 'basic'
                            CHECK (wage_basis IN ('basic', 'basic_da')),
    -- Denominator per month (India: 26 for 5-day, 30 for 6-day week)
    working_days_denominator INT NOT NULL DEFAULT 26,
    -- Numerator (India: 15 days per year)
    days_per_year       INT NOT NULL DEFAULT 15,
    -- Formula: (wage / denominator) * days_per_year * years_of_service
    max_gratuity        NUMERIC(14,2) NOT NULL DEFAULT 2000000,  -- 20L cap

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by          BIGINT REFERENCES users(id),

    CONSTRAINT uq_gratuity_config_org UNIQUE (organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. LABOUR WELFARE FUND — STATE SLABS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_lwf_slabs (
    id              BIGSERIAL PRIMARY KEY,
    state_code      TEXT NOT NULL,
    state_name      TEXT NOT NULL,
    -- Contribution amounts (INR)
    employee_amount NUMERIC(8,2) NOT NULL DEFAULT 0,
    employer_amount NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Collection frequency and months
    frequency       TEXT NOT NULL DEFAULT 'monthly'
                        CHECK (frequency IN ('monthly','quarterly','biannual','annual')),
    collection_months JSONB NOT NULL DEFAULT '[6,12]',
    notes           TEXT,

    CONSTRAINT uq_lwf_slabs_state UNIQUE (state_code)
);

INSERT INTO statutory_lwf_slabs (state_code, state_name, employee_amount, employer_amount, frequency, collection_months, notes) VALUES
('KA', 'Karnataka',           10.00,   20.00, 'biannual', '[6,12]',  'June & December'),
('MH', 'Maharashtra',          6.00,   12.00, 'monthly',  '[1,2,3,4,5,6,7,8,9,10,11,12]', 'Monthly deduction'),
('AP', 'Andhra Pradesh',       20.00,  40.00, 'annual',   '[12]',    'December'),
('TS', 'Telangana',            20.00,  40.00, 'annual',   '[12]',    'December'),
('TN', 'Tamil Nadu',           10.00,  20.00, 'biannual', '[6,12]',  'June & December'),
('GJ', 'Gujarat',               6.00,   12.00, 'biannual', '[3,9]',   'March & September'),
('WB', 'West Bengal',           3.00,   15.00, 'biannual', '[6,12]',  'June & December'),
('MP', 'Madhya Pradesh',        9.00,   18.00, 'biannual', '[6,12]',  'June & December'),
('HR', 'Haryana',              0.00,   0.00,  'annual',   '[]',      'Not applicable'),
('DL', 'Delhi',                0.00,   0.00,  'annual',   '[]',      'Not applicable')
ON CONFLICT (state_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. LWF CONFIG (per organization)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_lwf_config (
    id              BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    state_code      TEXT NOT NULL DEFAULT 'KA',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      BIGINT REFERENCES users(id),

    CONSTRAINT uq_lwf_config_org UNIQUE (organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. BONUS CONFIG
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_bonus_config (
    id                      BIGSERIAL PRIMARY KEY,
    organization_id         BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    statutory_bonus_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    -- Statutory bonus: 8.33% of basic+DA or ₹7000 whichever higher, capped at ₹21000 wage
    statutory_bonus_pct     NUMERIC(5,2) NOT NULL DEFAULT 8.33,
    statutory_wage_ceiling  NUMERIC(10,2) NOT NULL DEFAULT 21000,
    statutory_wage_floor    NUMERIC(10,2) NOT NULL DEFAULT 7000,
    -- Festival bonus (Diwali etc.)
    festival_bonus_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    festival_bonus_months   JSONB NOT NULL DEFAULT '[10]',   -- October = Diwali

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by              BIGINT REFERENCES users(id),

    CONSTRAINT uq_bonus_config_org UNIQUE (organization_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. COMPLIANCE RETURN TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statutory_compliance_returns (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    return_type         TEXT NOT NULL,  -- 'PF_ECR', 'ESI_RETURN', 'PT_CHALLAN', 'TDS_CHALLAN', 'TDS_ANNUAL_RETURN'
    period_month        INT CHECK (period_month BETWEEN 1 AND 12),
    period_year         INT CHECK (period_year BETWEEN 2000 AND 2100),
    financial_year      TEXT,           -- for annual returns
    due_date            DATE,
    filed_date          DATE,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','in_progress','filed','overdue')),
    amount              NUMERIC(14,2),
    challan_number      TEXT,
    notes               TEXT,
    filed_by            BIGINT REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scr_org_type   ON statutory_compliance_returns(organization_id, return_type);
CREATE INDEX IF NOT EXISTS idx_scr_due_date   ON statutory_compliance_returns(due_date) WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. EXTEND PAYSLIPS with statutory columns
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS eps_amount            NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS epf_employer_amount   NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS lwf_employee          NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS lwf_employer          NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gratuity_accrual      NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS tds_annual_projected  NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS tds_ytd               NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS statutory_snapshot    JSONB;  -- immutable full calc details
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS regime                TEXT;   -- 'old' or 'new' (TDS regime used)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 14. NEW PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO permissions (module_key, action, label, description)
VALUES
    ('statutory', 'view',               'View Statutory',         'View compliance configs and reports'),
    ('statutory', 'configure',          'Configure Statutory',    'Set up PF, ESI, PT, TDS, Gratuity, LWF'),
    ('statutory', 'approve_declarations','Approve Declarations',  'Review and approve employee tax declarations'),
    ('statutory', 'file_returns',       'File Returns',           'Mark compliance returns as filed'),
    ('statutory', 'declare',            'Submit Declaration',     'Employee self-service tax declaration'),
    ('payroll',   'view_ytd',           'View YTD Payroll',       'View year-to-date payroll totals'),
    ('payroll',   'form16',             'Form 16 Export',         'Export Form 16 dataset')
ON CONFLICT (module_key, action) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15. EXTEND AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    ALTER TABLE payroll_audit_log DROP CONSTRAINT IF EXISTS payroll_audit_log_action_check;
    ALTER TABLE payroll_audit_log
        ADD CONSTRAINT payroll_audit_log_action_check
        CHECK (action IN (
            'salary_created','salary_updated','salary_deactivated','settings_updated',
            'payroll_generated','payroll_regenerated','payroll_locked','payroll_unlocked',
            'payslip_emailed','payslip_published','payroll_auto_generated',
            'payroll_verified','payroll_approved','payroll_paid',
            'adjustment_added','adjustment_updated','adjustment_deleted',
            'override_added','override_deleted',
            'report_exported','bank_file_generated',
            'statutory_config_updated','declaration_submitted','declaration_approved',
            'declaration_rejected','proof_approved','proof_rejected','return_filed'
        ));
    ALTER TABLE payroll_audit_log DROP CONSTRAINT IF EXISTS payroll_audit_log_entity_type_check;
    ALTER TABLE payroll_audit_log
        ADD CONSTRAINT payroll_audit_log_entity_type_check
        CHECK (entity_type IN (
            'salary_structure','payroll_settings','payslip','payroll_run',
            'adjustment','override','report',
            'statutory_config','tds_declaration','investment_proof','compliance_return'
        ));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 16. BACK-FILL ROLE PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    rec       RECORD;
    v_role_id BIGINT;
    v_perm_id BIGINT;
BEGIN
    -- hr_admin: view + configure + approve + file_returns + view_ytd
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'hr_admin' LOOP
        SELECT id INTO v_role_id FROM roles WHERE org_id = rec.org_id AND slug = 'hr_admin' LIMIT 1;
        IF v_role_id IS NULL THEN CONTINUE; END IF;
        FOR v_perm_id IN
            SELECT id FROM permissions
             WHERE (module_key = 'statutory' AND action IN ('view','configure','approve_declarations','file_returns'))
                OR (module_key = 'payroll'   AND action IN ('view_ytd','form16'))
        LOOP
            INSERT INTO role_permissions (role_id, permission_id) VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END LOOP;

    -- root_admin: all statutory permissions
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'root_admin' LOOP
        SELECT id INTO v_role_id FROM roles WHERE org_id = rec.org_id AND slug = 'root_admin' LIMIT 1;
        IF v_role_id IS NULL THEN CONTINUE; END IF;
        FOR v_perm_id IN
            SELECT id FROM permissions WHERE module_key IN ('statutory','payroll')
        LOOP
            INSERT INTO role_permissions (role_id, permission_id) VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END LOOP;

    -- employee: declare
    FOR rec IN SELECT DISTINCT org_id FROM roles WHERE slug = 'employee' LOOP
        SELECT id INTO v_role_id FROM roles WHERE org_id = rec.org_id AND slug = 'employee' LIMIT 1;
        IF v_role_id IS NULL THEN CONTINUE; END IF;
        FOR v_perm_id IN
            SELECT id FROM permissions WHERE module_key = 'statutory' AND action = 'declare'
        LOOP
            INSERT INTO role_permissions (role_id, permission_id) VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 17. VERSION TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO schema_migrations (version, description) VALUES
    ('20260730_phase3_701', 'Created statutory_pf_config table'),
    ('20260730_phase3_702', 'Created statutory_esi_config table'),
    ('20260730_phase3_703', 'Created statutory_pt_slabs and statutory_pt_config tables; seeded 10 Indian states'),
    ('20260730_phase3_704', 'Created statutory_tds_config and statutory_tds_declarations tables'),
    ('20260730_phase3_705', 'Created statutory_investment_proofs table'),
    ('20260730_phase3_706', 'Created statutory_gratuity_config table'),
    ('20260730_phase3_707', 'Created statutory_lwf_slabs and statutory_lwf_config; seeded 10 states'),
    ('20260730_phase3_708', 'Created statutory_bonus_config table'),
    ('20260730_phase3_709', 'Created statutory_compliance_returns table'),
    ('20260730_phase3_710', 'Extended payslips with statutory columns (eps, lwf, gratuity, tds_ytd, snapshot)'),
    ('20260730_phase3_711', 'Added statutory permissions and back-filled role grants'),
    ('20260730_phase3_712', 'Extended payroll_audit_log constraints for Phase 3.7 actions')
ON CONFLICT (version) DO NOTHING;

-- Verify
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name ILIKE 'statutory_%'
 ORDER BY table_name;

COMMIT;
