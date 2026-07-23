-- ============================================================
-- EMPLOYEE PROFILE V2 — COMPREHENSIVE PROFILE MIGRATION
-- Run AFTER full_schema.sql AND sanghavi_migration.sql
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
--
-- PART 1 : Patch users table (10 missing Sanghavi fields + structured address)
-- PART 2 : Patch existing employee_qualifications & employee_experiences
-- PART 3 : Create 10 new normalized profile tables
-- PART 4 : Create profile_audit_log
-- PART 5 : Add all indexes
-- PART 6 : Pre-fix: index for reporting_to (future org chart)
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- PART 1 — PATCH users TABLE
-- ─────────────────────────────────────────────────────────────
-- Fields found in Sanghavi spreadsheet that are missing from schema
-- Fields already in schema (phone, gender, salutation, grade, etc.) are skipped

ALTER TABLE users
  -- Sanghavi: BloodGroup
  ADD COLUMN IF NOT EXISTS blood_group            TEXT,

  -- Sanghavi: Nationality, Religion, MaritalStatus, Citizenship
  ADD COLUMN IF NOT EXISTS nationality            TEXT,
  ADD COLUMN IF NOT EXISTS religion               TEXT,
  ADD COLUMN IF NOT EXISTS marital_status         TEXT,
  ADD COLUMN IF NOT EXISTS citizenship            TEXT,

  -- Sanghavi: Height, Weight (stored as TEXT to preserve original units)
  ADD COLUMN IF NOT EXISTS height                 TEXT,
  ADD COLUMN IF NOT EXISTS weight                 TEXT,

  -- Sanghavi: CostCentre
  ADD COLUMN IF NOT EXISTS cost_centre            TEXT,

  -- Sanghavi: PTRule, ESIOffice (statutory extras)
  ADD COLUMN IF NOT EXISTS pt_rule                TEXT,
  ADD COLUMN IF NOT EXISTS esi_office             TEXT,

  -- Structured current address (old address TEXT column kept for backward compat)
  ADD COLUMN IF NOT EXISTS current_address_line1  TEXT,
  ADD COLUMN IF NOT EXISTS current_address_line2  TEXT,
  ADD COLUMN IF NOT EXISTS current_city           TEXT,
  ADD COLUMN IF NOT EXISTS current_state          TEXT,
  ADD COLUMN IF NOT EXISTS current_country        TEXT,
  ADD COLUMN IF NOT EXISTS current_postal_code    TEXT,

  -- Permanent address (separate from current)
  ADD COLUMN IF NOT EXISTS permanent_address      TEXT,
  ADD COLUMN IF NOT EXISTS permanent_city         TEXT,
  ADD COLUMN IF NOT EXISTS permanent_state        TEXT,
  ADD COLUMN IF NOT EXISTS permanent_country      TEXT,
  ADD COLUMN IF NOT EXISTS permanent_postal_code  TEXT,

  -- Audit trail on users itself
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by             BIGINT REFERENCES users(id);

-- Index for org + status filtering (used on employee list page)
CREATE INDEX IF NOT EXISTS idx_users_org_status
  ON users(organization_id, employee_status);

-- Index for name search
CREATE INDEX IF NOT EXISTS idx_users_org_name
  ON users(organization_id, name);


-- ─────────────────────────────────────────────────────────────
-- PART 2 — PATCH EXISTING PROFILE TABLES
-- Standardize column names and add missing audit columns
-- ─────────────────────────────────────────────────────────────

-- employee_qualifications: rename org_id → organization_id, add audit cols
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_qualifications' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE employee_qualifications RENAME COLUMN org_id TO organization_id;
  END IF;
END $$;

ALTER TABLE employee_qualifications
  ADD COLUMN IF NOT EXISTS degree_level    TEXT,   -- SSC / HSC / Graduation / PostGrad / Diploma / Other
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by      BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by      BIGINT REFERENCES users(id);

-- employee_experiences: rename org_id → organization_id, add audit cols + missing fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employee_experiences' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE employee_experiences RENAME COLUMN org_id TO organization_id;
  END IF;
END $$;

ALTER TABLE employee_experiences
  ADD COLUMN IF NOT EXISTS department       TEXT,
  ADD COLUMN IF NOT EXISTS employment_type  TEXT,
  ADD COLUMN IF NOT EXISTS last_salary      NUMERIC,
  ADD COLUMN IF NOT EXISTS manager_name     TEXT,
  ADD COLUMN IF NOT EXISTS reason_leaving   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by       BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by       BIGINT REFERENCES users(id);


-- ─────────────────────────────────────────────────────────────
-- PART 3 — NEW NORMALIZED PROFILE TABLES
-- Each table: id, employee_id, organization_id,
--             created_at, updated_at, created_by, updated_by
-- ─────────────────────────────────────────────────────────────

-- ── 3A. FAMILY MEMBERS ────────────────────────────────────────
-- Covers: Father, Mother, Spouse, Children (multi-row per employee)
-- Sanghavi: FatherName/DOB/Occupation, MotherName, WifeName, ChildName×3
CREATE TABLE IF NOT EXISTS employee_family_members (
  id               BIGSERIAL PRIMARY KEY,
  employee_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  relationship     TEXT NOT NULL,  -- father, mother, spouse, child, sibling, other
  name             TEXT NOT NULL,
  date_of_birth    DATE,
  gender           TEXT,
  occupation       TEXT,
  contact_number   TEXT,
  dependent        BOOLEAN DEFAULT FALSE,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  created_by       BIGINT REFERENCES users(id),
  updated_by       BIGINT REFERENCES users(id)
);


-- ── 3B. EMERGENCY CONTACTS ────────────────────────────────────
-- Sanghavi: emergency_contact_name/phone/relation already in users (single record)
-- This table supports multiple emergency contacts with priority order
CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
  id               BIGSERIAL PRIMARY KEY,
  employee_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  contact_name     TEXT NOT NULL,
  relationship     TEXT,
  mobile_number    TEXT NOT NULL,
  alternate_number TEXT,
  email            TEXT,
  address          TEXT,
  is_primary       BOOLEAN DEFAULT FALSE,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  created_by       BIGINT REFERENCES users(id),
  updated_by       BIGINT REFERENCES users(id)
);


-- ── 3C. NOMINEES ──────────────────────────────────────────────
-- Sanghavi: NomineeName, NomineeRelationship, NominationDOB
-- Multiple nominees with percentage share (must total 100%)
CREATE TABLE IF NOT EXISTS employee_nominees (
  id               BIGSERIAL PRIMARY KEY,
  employee_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  nominee_name     TEXT NOT NULL,
  relationship     TEXT NOT NULL,
  date_of_birth    DATE,
  percentage_share NUMERIC DEFAULT 100 CHECK (percentage_share > 0 AND percentage_share <= 100),
  address          TEXT,
  contact_number   TEXT,
  is_primary       BOOLEAN DEFAULT FALSE,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  created_by       BIGINT REFERENCES users(id),
  updated_by       BIGINT REFERENCES users(id)
);


-- ── 3D. BANK ACCOUNTS ─────────────────────────────────────────
-- Moves bank_name/bank_account_number/bank_ifsc from users to here
-- Sanghavi adds: BranchCode, BankBranchName, EAccountType, PaymentMethod
CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id                   BIGSERIAL PRIMARY KEY,
  employee_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  bank_name            TEXT NOT NULL,
  branch_name          TEXT,
  branch_code          TEXT,
  account_number       TEXT NOT NULL,
  account_holder_name  TEXT,
  account_type         TEXT DEFAULT 'savings'
                         CHECK (account_type IN ('savings','current','salary','nre','nro','other')),
  ifsc_code            TEXT,
  swift_code           TEXT,
  payment_method       TEXT DEFAULT 'bank_transfer'
                         CHECK (payment_method IN ('bank_transfer','cheque','cash','upi','other')),
  is_primary           BOOLEAN DEFAULT TRUE,
  is_salary_account    BOOLEAN DEFAULT TRUE,
  is_active            BOOLEAN DEFAULT TRUE,

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ,
  created_by           BIGINT REFERENCES users(id),
  updated_by           BIGINT REFERENCES users(id)
);


-- ── 3E. GOVERNMENT DOCUMENTS ──────────────────────────────────
-- Sanghavi: DrivingLicenseNo/Expiry, RationCardNo
-- Already in users: AadharNo, PANNo, UANNo, VoterId
-- This table stores structured + file versions of all govt docs
CREATE TABLE IF NOT EXISTS employee_government_documents (
  id                   BIGSERIAL PRIMARY KEY,
  employee_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  document_type        TEXT NOT NULL
                         CHECK (document_type IN (
                           'aadhar','pan','passport','driving_license',
                           'voter_id','ration_card','uan','esic','pf',
                           'birth_certificate','other'
                         )),
  document_number      TEXT,
  issue_date           DATE,
  expiry_date          DATE,
  issuing_authority    TEXT,
  file_url             TEXT,  -- Cloudinary URL
  verification_status  TEXT DEFAULT 'pending'
                         CHECK (verification_status IN ('pending','verified','rejected')),
  verified_by          BIGINT REFERENCES users(id),
  verified_at          TIMESTAMPTZ,
  remarks              TEXT,

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ,
  created_by           BIGINT REFERENCES users(id),
  updated_by           BIGINT REFERENCES users(id),

  UNIQUE(employee_id, document_type, organization_id)
);


-- ── 3F. IMMIGRATION ───────────────────────────────────────────
-- Sanghavi: Citizenship, ImmigrationType, ImmigrationNo,
--           ImmigrationIssueDate, ImmigrationExpiryDate, ImmigrationComments
CREATE TABLE IF NOT EXISTS employee_immigration (
  id               BIGSERIAL PRIMARY KEY,
  employee_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  citizenship      TEXT,
  immigration_type TEXT,  -- work_permit, resident_visa, student_visa, etc.
  immigration_no   TEXT,
  passport_number  TEXT,
  visa_type        TEXT,
  issue_date       DATE,
  expiry_date      DATE,
  country          TEXT,
  file_url         TEXT,
  remarks          TEXT,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  created_by       BIGINT REFERENCES users(id),
  updated_by       BIGINT REFERENCES users(id)
);


-- ── 3G. SKILLS ────────────────────────────────────────────────
-- Technical skills, soft skills, and languages in one table
-- Differentiated by skill_category
CREATE TABLE IF NOT EXISTS employee_skills (
  id                   BIGSERIAL PRIMARY KEY,
  employee_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  skill_name           TEXT NOT NULL,
  skill_category       TEXT DEFAULT 'technical'
                         CHECK (skill_category IN ('technical','soft','language','other')),
  proficiency_level    TEXT DEFAULT 'intermediate'
                         CHECK (proficiency_level IN ('beginner','intermediate','advanced','expert')),
  years_of_experience  NUMERIC,

  -- Language-specific (when skill_category = 'language')
  can_read             BOOLEAN,
  can_write            BOOLEAN,
  can_speak            BOOLEAN,

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ,
  created_by           BIGINT REFERENCES users(id),
  updated_by           BIGINT REFERENCES users(id),

  UNIQUE(employee_id, skill_name, organization_id)
);


-- ── 3H. HEALTH ────────────────────────────────────────────────
-- Blood group moved here from users; insurance and medical notes
CREATE TABLE IF NOT EXISTS employee_health (
  id                        BIGSERIAL PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id           BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  blood_group               TEXT,
  height                    TEXT,
  weight                    TEXT,
  allergies                 TEXT,
  medical_conditions        TEXT,
  disabilities              TEXT,
  health_insurance_provider TEXT,
  health_insurance_number   TEXT,
  health_insurance_expiry   DATE,
  emergency_medical_notes   TEXT,

  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ,
  created_by                BIGINT REFERENCES users(id),
  updated_by                BIGINT REFERENCES users(id),

  UNIQUE(employee_id, organization_id)  -- one health record per employee
);


-- ── 3I. TRAINING ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_training (
  id                  BIGSERIAL PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  training_name       TEXT NOT NULL,
  training_type       TEXT DEFAULT 'other'
                        CHECK (training_type IN (
                          'online','offline','workshop','conference',
                          'internal','external','other'
                        )),
  training_provider   TEXT,
  start_date          DATE,
  end_date            DATE,
  duration_hours      NUMERIC,
  completion_status   TEXT DEFAULT 'in_progress'
                        CHECK (completion_status IN ('planned','in_progress','completed','cancelled')),
  score               TEXT,
  certificate_url     TEXT,
  remarks             TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ,
  created_by          BIGINT REFERENCES users(id),
  updated_by          BIGINT REFERENCES users(id)
);


-- ── 3J. CERTIFICATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_certifications (
  id                   BIGSERIAL PRIMARY KEY,
  employee_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  certification_name   TEXT NOT NULL,
  issuing_authority    TEXT,
  issue_date           DATE,
  expiry_date          DATE,
  certification_number TEXT,
  file_url             TEXT,
  is_lifetime          BOOLEAN DEFAULT FALSE,  -- never expires

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ,
  created_by           BIGINT REFERENCES users(id),
  updated_by           BIGINT REFERENCES users(id)
);


-- ─────────────────────────────────────────────────────────────
-- PART 4 — PROFILE AUDIT LOG
-- Tracks every create/update/delete across all profile sections
-- Required for: Timeline, Activity Feed, Change History
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profile_audit_log (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  section          TEXT NOT NULL,  -- 'personal','banking','family','skills','education', etc.
  action           TEXT NOT NULL CHECK (action IN ('created','updated','deleted')),

  old_values       JSONB,
  new_values       JSONB,
  change_summary   TEXT,  -- human-readable: "Updated phone from X to Y"

  changed_by       BIGINT REFERENCES users(id),
  changed_at       TIMESTAMPTZ DEFAULT NOW(),
  ip_address       TEXT
);


-- ─────────────────────────────────────────────────────────────
-- PART 5 — INDEXES
-- ─────────────────────────────────────────────────────────────

-- employee_family_members
CREATE INDEX IF NOT EXISTS idx_emp_family_emp_org
  ON employee_family_members(employee_id, organization_id);

-- employee_emergency_contacts
CREATE INDEX IF NOT EXISTS idx_emp_emergency_emp_org
  ON employee_emergency_contacts(employee_id, organization_id);

-- employee_nominees
CREATE INDEX IF NOT EXISTS idx_emp_nominees_emp_org
  ON employee_nominees(employee_id, organization_id);

-- employee_bank_accounts
CREATE INDEX IF NOT EXISTS idx_emp_bank_emp_org
  ON employee_bank_accounts(employee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_bank_primary
  ON employee_bank_accounts(employee_id, organization_id)
  WHERE is_primary = TRUE AND is_active = TRUE;

-- employee_government_documents
CREATE INDEX IF NOT EXISTS idx_emp_govdocs_emp_org
  ON employee_government_documents(employee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_govdocs_expiry
  ON employee_government_documents(organization_id, expiry_date)
  WHERE expiry_date IS NOT NULL;  -- for expiry alert cron job

-- employee_immigration
CREATE INDEX IF NOT EXISTS idx_emp_immigration_emp_org
  ON employee_immigration(employee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_immigration_expiry
  ON employee_immigration(organization_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

-- employee_skills
CREATE INDEX IF NOT EXISTS idx_emp_skills_emp_org
  ON employee_skills(employee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_skills_category
  ON employee_skills(organization_id, skill_category);

-- employee_health
CREATE INDEX IF NOT EXISTS idx_emp_health_emp_org
  ON employee_health(employee_id, organization_id);

-- employee_training
CREATE INDEX IF NOT EXISTS idx_emp_training_emp_org
  ON employee_training(employee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_training_status
  ON employee_training(organization_id, completion_status);

-- employee_certifications
CREATE INDEX IF NOT EXISTS idx_emp_certifications_emp_org
  ON employee_certifications(employee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_certifications_expiry
  ON employee_certifications(organization_id, expiry_date)
  WHERE expiry_date IS NOT NULL AND is_lifetime = FALSE;

-- employee_qualifications (already has idx_emp_qual_user — add org index)
CREATE INDEX IF NOT EXISTS idx_emp_qual_emp_org
  ON employee_qualifications(user_id, organization_id);

-- employee_experiences (already has idx_emp_exp_user — add org index)
CREATE INDEX IF NOT EXISTS idx_emp_exp_emp_org
  ON employee_experiences(user_id, organization_id);

-- profile_audit_log
CREATE INDEX IF NOT EXISTS idx_audit_emp_org
  ON profile_audit_log(employee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_section
  ON profile_audit_log(organization_id, section, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by
  ON profile_audit_log(changed_by, changed_at DESC);


-- ─────────────────────────────────────────────────────────────
-- PART 6 — PRE-FIX INDEXES (future-proofing)
-- ─────────────────────────────────────────────────────────────

-- Org chart: reporting_to hierarchy traversal
CREATE INDEX IF NOT EXISTS idx_users_reporting_to
  ON users(reporting_to, organization_id)
  WHERE reporting_to IS NOT NULL;

-- HOD lookup
CREATE INDEX IF NOT EXISTS idx_users_hod
  ON users(hod_id, organization_id)
  WHERE hod_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- DONE
-- Next step: backend API routes for each new table
-- ─────────────────────────────────────────────────────────────
