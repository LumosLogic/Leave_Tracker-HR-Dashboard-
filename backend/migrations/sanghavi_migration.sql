-- ============================================================
-- SANGHAVI ASSOCIATION MIGRATION
-- Run AFTER full_schema.sql
-- 1. Patches missing columns (to match live Supabase schema)
-- 2. Adds Sanghavi-specific new tables and columns
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PART 1: PATCH MISSING COLUMNS (match live Supabase schema)
-- ─────────────────────────────────────────────────────────────

-- USERS — missing from full_schema.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id              TEXT,
  ADD COLUMN IF NOT EXISTS phone                    TEXT,
  ADD COLUMN IF NOT EXISTS gender                   TEXT,
  ADD COLUMN IF NOT EXISTS address                  TEXT,
  ADD COLUMN IF NOT EXISTS employment_type          TEXT DEFAULT 'full-time',
  ADD COLUMN IF NOT EXISTS employment_status        TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS date_of_joining          TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_date        TEXT,
  ADD COLUMN IF NOT EXISTS reporting_to             BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS emergency_contact_name   TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number      TEXT,
  ADD COLUMN IF NOT EXISTS bank_name                TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc                TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url        TEXT,
  ADD COLUMN IF NOT EXISTS department_id            BIGINT REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS designation_id           BIGINT REFERENCES designations(id),
  ADD COLUMN IF NOT EXISTS email_verified           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verify_code        TEXT,
  ADD COLUMN IF NOT EXISTS status                   TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS personal_email           TEXT,
  ADD COLUMN IF NOT EXISTS joining_date             DATE,
  ADD COLUMN IF NOT EXISTS work_mode                TEXT DEFAULT 'office',
  ADD COLUMN IF NOT EXISTS employee_status          TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ctc                      NUMERIC,
  ADD COLUMN IF NOT EXISTS salary_effective_date    DATE;

-- ASSETS — missing columns
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS brand        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS model        TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS condition    TEXT DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS assigned_at  TEXT,
  ADD COLUMN IF NOT EXISTS return_date  TEXT;

-- ANNOUNCEMENTS — missing columns
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS file_url  TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT;

-- SHIFTS — missing column
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS days_of_week TEXT;

-- EXIT_REQUESTS — missing columns
ALTER TABLE exit_requests
  ADD COLUMN IF NOT EXISTS exit_interview_date  TEXT,
  ADD COLUMN IF NOT EXISTS exit_interview_done  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exit_interview_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS clearance_it         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clearance_hr         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clearance_finance    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clearance_admin      BOOLEAN DEFAULT FALSE;

-- PAYSLIPS — missing column
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT '';

-- EMPLOYEE_DOCUMENTS — missing columns
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'self'
    CHECK (visibility IN ('self','all','specific','admin_only'));

-- NOTIFICATIONS — missing column
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link TEXT DEFAULT '';

-- NOTIFICATIONS_LOG — missing organization_id
ALTER TABLE notifications_log
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);

-- LEAVE_POLICIES — missing accrual_type
ALTER TABLE leave_policies
  ADD COLUMN IF NOT EXISTS accrual_type TEXT DEFAULT 'yearly';

-- PLATFORM_ACTIVITY — missing organization_id
ALTER TABLE platform_activity
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);


-- ─────────────────────────────────────────────────────────────
-- PART 2: MISSING TABLES (match live Supabase schema)
-- ─────────────────────────────────────────────────────────────

-- ARCHIVES — soft-delete / audit trail
CREATE TABLE IF NOT EXISTS archives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  table_name      TEXT NOT NULL,
  record          JSONB NOT NULL,
  archived_by     BIGINT REFERENCES users(id),
  archived_at     TIMESTAMPTZ DEFAULT NOW()
);

-- DOCUMENT_SHARES — per-user sharing for employee_documents
CREATE TABLE IF NOT EXISTS document_shares (
  id                   BIGSERIAL PRIMARY KEY,
  document_id          BIGINT NOT NULL REFERENCES employee_documents(id),
  shared_with_user_id  BIGINT NOT NULL REFERENCES users(id),
  organization_id      BIGINT NOT NULL REFERENCES organizations(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- PART 3: SANGHAVI / BIOMETRIC ADDITIONS
-- ─────────────────────────────────────────────────────────────

-- 3A. BRANCHES
CREATE TABLE IF NOT EXISTS branches (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  code       TEXT,
  location   TEXT,
  address    TEXT,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(org_id);


-- 3B. BIOMETRIC DEVICES
CREATE TABLE IF NOT EXISTS biometric_devices (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serial_number TEXT UNIQUE NOT NULL,
  device_name   TEXT,
  location      TEXT,
  branch_id     BIGINT REFERENCES branches(id),
  area_code     INT,
  device_ip     TEXT,
  last_seen     TIMESTAMPTZ,
  status        TEXT DEFAULT 'offline' CHECK (status IN ('online','offline')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_org ON biometric_devices(org_id);


-- 3C. BIOMETRIC RAW LOGS (append-only — never delete, never update except processed flag)
CREATE TABLE IF NOT EXISTS biometric_raw_logs (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_serial TEXT NOT NULL,
  employee_pin  TEXT NOT NULL,
  punch_time    TIMESTAMPTZ NOT NULL,
  punch_type    SMALLINT,    -- 0=Check-In, 1=Check-Out, 4=OT-In, 5=OT-Out
  verify_type   SMALLINT,    -- 1=Fingerprint, 2=Face, 4=Card
  area          TEXT,
  raw_payload   JSONB,
  processed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_serial, punch_time, employee_pin)
);
CREATE INDEX IF NOT EXISTS idx_bio_logs_org_time ON biometric_raw_logs(org_id, punch_time DESC);
CREATE INDEX IF NOT EXISTS idx_bio_logs_unprocessed ON biometric_raw_logs(org_id, processed) WHERE processed = FALSE;


-- 3D. BIOMETRIC EMPLOYEE MAP (PIN → HRMS user)
CREATE TABLE IF NOT EXISTS biometric_employee_map (
  id           BIGSERIAL PRIMARY KEY,
  org_id       BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_pin TEXT NOT NULL,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, employee_pin)
);
CREATE INDEX IF NOT EXISTS idx_bio_map_org ON biometric_employee_map(org_id);


-- 3E. ATTENDANCE — new columns
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS source              TEXT DEFAULT 'manual'
    CHECK (source IN ('manual','biometric','clockify')),
  ADD COLUMN IF NOT EXISTS ot_hours            NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes        INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_exit_minutes  INT DEFAULT 0;


-- 3F. USERS — extended profile (biometric + org structure)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_enrollment_id   TEXT,
  ADD COLUMN IF NOT EXISTS branch_id              BIGINT REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS salutation             TEXT,
  ADD COLUMN IF NOT EXISTS middle_name            TEXT,
  ADD COLUMN IF NOT EXISTS surname                TEXT,
  ADD COLUMN IF NOT EXISTS division               TEXT,
  ADD COLUMN IF NOT EXISTS sub_division           TEXT,
  ADD COLUMN IF NOT EXISTS grade                  TEXT,
  ADD COLUMN IF NOT EXISTS pay_cadre              TEXT,
  ADD COLUMN IF NOT EXISTS location               TEXT,
  ADD COLUMN IF NOT EXISTS probation_applicable   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS probation_months       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hod_id                 BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS old_employee_id        TEXT,
  ADD COLUMN IF NOT EXISTS voter_id               TEXT,
  ADD COLUMN IF NOT EXISTS special_allowance      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aadhar_no              TEXT,
  ADD COLUMN IF NOT EXISTS pan_number             TEXT,
  ADD COLUMN IF NOT EXISTS pan_name               TEXT,
  ADD COLUMN IF NOT EXISTS uan_no                 TEXT,
  ADD COLUMN IF NOT EXISTS weekly_off_day         TEXT,
  ADD COLUMN IF NOT EXISTS work_hours_per_day     NUMERIC DEFAULT 8;

-- Unique device enrollment ID per org (one PIN per org only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device_pin_org
  ON users(organization_id, device_enrollment_id)
  WHERE device_enrollment_id IS NOT NULL;


-- 3G. USERS — statutory / payroll fields (PF/ESI/PT/OT — Administration tab)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pf_applicable         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pf_no                 TEXT,
  ADD COLUMN IF NOT EXISTS vpf_applicable        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vpf_percentage        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_pf_amount         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pran                  TEXT,
  ADD COLUMN IF NOT EXISTS is_pf_on_gross        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS esi_applicable        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS esi_no                TEXT,
  ADD COLUMN IF NOT EXISTS esi_dispensary        TEXT,
  ADD COLUMN IF NOT EXISTS pt_applicable         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lwf_applicable        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gratuity_applicable   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gratuity_id           TEXT,
  ADD COLUMN IF NOT EXISTS gl_code               TEXT,
  ADD COLUMN IF NOT EXISTS bonus_applicable      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ot_applicable         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ot_rate               NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_paid_with_salary   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS salary_structure      TEXT DEFAULT 'GROSS',
  ADD COLUMN IF NOT EXISTS salary_on             TEXT DEFAULT 'Month',
  ADD COLUMN IF NOT EXISTS per_hour_rate         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_day_wages         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_slip_format    TEXT DEFAULT 'Format1',
  ADD COLUMN IF NOT EXISTS max_weekoff_in_month  INT DEFAULT 8;


-- 3H. EMPLOYEE QUALIFICATIONS (multi-record education history)
CREATE TABLE IF NOT EXISTS employee_qualifications (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id           BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  institution      TEXT,
  board_university TEXT,
  year_of_passing  INT,
  percentage       NUMERIC,
  cgpa             NUMERIC,
  specialization   TEXT,
  degree_class     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_qual_user ON employee_qualifications(user_id);


-- 3I. EMPLOYEE EXPERIENCES (multi-record work history)
CREATE TABLE IF NOT EXISTS employee_experiences (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_name TEXT,
  designation  TEXT,
  industry     TEXT,
  start_date   DATE,
  end_date     DATE,
  ctc          NUMERIC,
  total_years  NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_exp_user ON employee_experiences(user_id);


-- ─────────────────────────────────────────────────────────────
-- PART 4: FEATURE FLAGS SEED
-- (biometric enabled for Sanghavi org — org_id = 1 by default)
-- Adjust org_id after creating the org via platform admin
-- ─────────────────────────────────────────────────────────────

INSERT INTO organization_features (organization_id, feature_key, enabled)
VALUES
  (1, 'biometric', true),
  (1, 'branches',  true),
  (1, 'statutory', true)
ON CONFLICT (organization_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;
