-- ============================================================
-- LeaveTracker — Complete Database Schema
-- Run this entire file in: Supabase → SQL Editor → New query
-- Safe to run on BOTH fresh and existing databases.
-- Uses CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. PLATFORM CORE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id                    BIGSERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  slug                  TEXT UNIQUE NOT NULL,
  domain                TEXT,
  logo_url              TEXT,
  status                TEXT DEFAULT 'active',
  plan                  TEXT DEFAULT 'free',
  smtp_host             TEXT,
  smtp_port             INTEGER DEFAULT 587,
  smtp_user             TEXT,
  smtp_pass             TEXT,
  smtp_from             TEXT,
  google_client_id      TEXT,
  google_client_secret  TEXT,
  google_refresh_token  TEXT,
  google_calendar_id    TEXT,
  clockify_api_key      TEXT,
  clockify_workspace_id TEXT,
  clockify_last_synced  TIMESTAMPTZ,
  vapid_public_key      TEXT,
  vapid_private_key     TEXT,
  total_annual_leaves   INTEGER DEFAULT 18,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_admins (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_registration_requests (
  id              BIGSERIAL PRIMARY KEY,
  company_name    TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  website         TEXT,
  message         TEXT,
  status          TEXT DEFAULT 'pending',
  ip_address      TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewer_notes  TEXT,
  organization_id BIGINT REFERENCES organizations(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_activity (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  description TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 2. USERS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                     BIGSERIAL PRIMARY KEY,
  name                   TEXT NOT NULL,
  email                  TEXT NOT NULL,
  password               TEXT NOT NULL,
  role                   TEXT DEFAULT 'employee',
  department             TEXT DEFAULT 'General',
  position               TEXT DEFAULT 'Staff',
  avatar_color           TEXT DEFAULT '#4F46E5',
  date_of_birth          TEXT,
  clockify_user_id       TEXT,
  force_password_change  BOOLEAN DEFAULT FALSE,
  password_reset_token   TEXT,
  password_reset_expires TIMESTAMPTZ,
  organization_id        BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 3. DEPARTMENTS & STRUCTURE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  head_user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS designations (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  department_id   BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_departments (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id   BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  role_in_dept    TEXT DEFAULT 'Member',
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, department_id)
);


-- ─────────────────────────────────────────────────────────────
-- 4. WORK CONFIGURATION
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_schedule (
  id                   BIGSERIAL PRIMARY KEY,
  start_time           TEXT DEFAULT '09:00',
  end_time             TEXT DEFAULT '18:00',
  late_threshold       TEXT DEFAULT '09:30',
  early_exit_threshold TEXT DEFAULT '17:00',
  half_day_hours       NUMERIC DEFAULT 4.5,
  work_days            TEXT DEFAULT '1,2,3,4,5',
  organization_id      BIGINT REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clockify_config (
  id              BIGSERIAL PRIMARY KEY,
  api_key         TEXT DEFAULT '',
  workspace_id    TEXT DEFAULT '',
  last_synced     TIMESTAMPTZ,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE
);


-- ─────────────────────────────────────────────────────────────
-- 5. ATTENDANCE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  check_in        TEXT,
  check_out       TEXT,
  status          TEXT DEFAULT 'present',
  is_late         BOOLEAN DEFAULT FALSE,
  is_early_exit   BOOLEAN DEFAULT FALSE,
  work_hours      NUMERIC DEFAULT 0,
  clockify_hours  NUMERIC DEFAULT 0,
  notes           TEXT,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, organization_id)
);

CREATE TABLE IF NOT EXISTS attendance_regularization (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                TEXT NOT NULL,
  requested_check_in  TEXT,
  requested_check_out TEXT,
  reason              TEXT,
  status              TEXT DEFAULT 'pending',
  reviewer_notes      TEXT,
  reviewed_by         BIGINT REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 6. LEAVES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leaves (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  leave_type      TEXT DEFAULT 'casual',
  leave_time      TEXT DEFAULT 'full',
  half_type       TEXT,
  reason          TEXT,
  status          TEXT DEFAULT 'pending',
  approved_by     BIGINT REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  google_event_id TEXT,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_policies (
  id                BIGSERIAL PRIMARY KEY,
  leave_type        TEXT NOT NULL,
  label             TEXT NOT NULL,
  annual_quota      INTEGER DEFAULT 12,
  carry_forward     BOOLEAN DEFAULT FALSE,
  max_carry_forward INTEGER DEFAULT 0,
  paid              BOOLEAN DEFAULT TRUE,
  active            BOOLEAN DEFAULT TRUE,
  organization_id   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 7. SHIFTS & ROSTER
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shifts (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  color           TEXT DEFAULT '#3525cd',
  description     TEXT DEFAULT '',
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id        BIGINT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, organization_id)
);


-- ─────────────────────────────────────────────────────────────
-- 8. HOLIDAYS & EVENTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holidays (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  date            TEXT NOT NULL,
  type            TEXT DEFAULT 'public',
  description     TEXT DEFAULT '',
  specific_msg    TEXT,
  google_event_id TEXT,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  date            TEXT NOT NULL,
  end_date        TEXT,
  description     TEXT DEFAULT '',
  created_by      BIGINT REFERENCES users(id),
  google_event_id TEXT,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 9. NOTIFICATIONS & PUSH
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  subscription    JSONB NOT NULL,
  user_agent      TEXT,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  message         TEXT,
  type            TEXT DEFAULT 'general',
  is_read         BOOLEAN DEFAULT FALSE,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications_log (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  body           TEXT,
  url            TEXT,
  target_user_id BIGINT,
  sent_by        BIGINT REFERENCES users(id),
  sent_count     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL,
  name            TEXT,
  active          BOOLEAN DEFAULT TRUE,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 10. ANNOUNCEMENTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  content         TEXT,
  type            TEXT DEFAULT 'general',
  priority        TEXT DEFAULT 'normal',
  target_audience TEXT DEFAULT 'all',
  pinned          BOOLEAN DEFAULT FALSE,
  expires_at      TEXT,
  created_by      BIGINT REFERENCES users(id),
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 11. EXPENSES & ASSETS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  category        TEXT DEFAULT 'other',
  amount          NUMERIC NOT NULL DEFAULT 0,
  expense_date    TEXT,
  description     TEXT,
  receipt_url     TEXT,
  status          TEXT DEFAULT 'pending',
  reviewer_notes  TEXT,
  reviewed_by     BIGINT REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  asset_tag       TEXT,
  category        TEXT DEFAULT 'other',
  status          TEXT DEFAULT 'available',
  assigned_to     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  purchase_date   TEXT,
  purchase_price  NUMERIC,
  serial_number   TEXT,
  condition_notes TEXT,
  notes           TEXT,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 12. PAYROLL
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_structures (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from      TEXT,
  basic               NUMERIC DEFAULT 0,
  hra                 NUMERIC DEFAULT 0,
  da                  NUMERIC DEFAULT 0,
  transport_allowance NUMERIC DEFAULT 0,
  medical_allowance   NUMERIC DEFAULT 0,
  other_allowances    NUMERIC DEFAULT 0,
  pf_employee         NUMERIC DEFAULT 0,
  pf_employer         NUMERIC DEFAULT 0,
  esi_employee        NUMERIC DEFAULT 0,
  esi_employer        NUMERIC DEFAULT 0,
  professional_tax    NUMERIC DEFAULT 0,
  tds                 NUMERIC DEFAULT 0,
  organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payslips (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month               TEXT NOT NULL,
  year                INTEGER NOT NULL,
  pay_period          TEXT,
  basic               NUMERIC DEFAULT 0,
  hra                 NUMERIC DEFAULT 0,
  da                  NUMERIC DEFAULT 0,
  transport_allowance NUMERIC DEFAULT 0,
  medical_allowance   NUMERIC DEFAULT 0,
  other_allowances    NUMERIC DEFAULT 0,
  gross_salary        NUMERIC DEFAULT 0,
  pf_employee         NUMERIC DEFAULT 0,
  pf_employer         NUMERIC DEFAULT 0,
  esi_employee        NUMERIC DEFAULT 0,
  esi_employer        NUMERIC DEFAULT 0,
  professional_tax    NUMERIC DEFAULT 0,
  tds                 NUMERIC DEFAULT 0,
  other_deductions    NUMERIC DEFAULT 0,
  total_deductions    NUMERIC DEFAULT 0,
  lop_days            NUMERIC DEFAULT 0,
  lop_amount          NUMERIC DEFAULT 0,
  net_salary          NUMERIC DEFAULT 0,
  working_days        INTEGER DEFAULT 0,
  present_days        NUMERIC DEFAULT 0,
  absent_days         INTEGER DEFAULT 0,
  leave_days          INTEGER DEFAULT 0,
  notes               TEXT,
  status              TEXT DEFAULT 'generated',
  generated_by        BIGINT REFERENCES users(id),
  organization_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month, year, organization_id)
);


-- ─────────────────────────────────────────────────────────────
-- 13. PERFORMANCE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS performance_goals (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT DEFAULT 'individual',
  target_date     TEXT,
  review_cycle    TEXT DEFAULT 'annual',
  created_by      BIGINT REFERENCES users(id),
  progress        NUMERIC DEFAULT 0,
  status          TEXT DEFAULT 'active',
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_cycle     TEXT,
  review_type      TEXT DEFAULT 'annual',
  reviewer_id      BIGINT REFERENCES users(id),
  self_rating      NUMERIC,
  self_comments    TEXT,
  manager_rating   NUMERIC,
  manager_comments TEXT,
  strengths        TEXT,
  improvements     TEXT,
  final_rating     NUMERIC,
  status           TEXT DEFAULT 'pending',
  organization_id  BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 14. ONBOARDING & EXIT
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  due_date        TEXT,
  assigned_to     TEXT DEFAULT 'employee',
  order_index     INTEGER DEFAULT 0,
  completed       BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exit_requests (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resignation_date   TEXT,
  reason             TEXT,
  notice_period_days INTEGER DEFAULT 30,
  last_working_day   TEXT,
  status             TEXT DEFAULT 'pending',
  reviewed_by        BIGINT REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  organization_id    BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 15. DOCUMENTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_documents (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT DEFAULT 'other',
  file_url        TEXT NOT NULL,
  file_type       TEXT,
  file_size       INTEGER,
  expiry_date     TEXT,
  uploaded_by     BIGINT REFERENCES users(id),
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- 16. FEATURE FLAGS  (Platform Admin controlled per-org)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_features (
  id              BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key     TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, feature_key)
);


-- ─────────────────────────────────────────────────────────────
-- 17. DISABLE ROW LEVEL SECURITY  (app handles auth via JWT)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE organizations             DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins           DISABLE ROW LEVEL SECURITY;
ALTER TABLE org_registration_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_activity         DISABLE ROW LEVEL SECURITY;
ALTER TABLE users                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments               DISABLE ROW LEVEL SECURITY;
ALTER TABLE designations              DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_departments          DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_schedule             DISABLE ROW LEVEL SECURITY;
ALTER TABLE clockify_config           DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance                DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_regularization DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaves                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE leave_policies            DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments         DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE events                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions        DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log         DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients   DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements             DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE assets                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_structures        DISABLE ROW LEVEL SECURITY;
ALTER TABLE payslips                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE performance_goals         DISABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews       DISABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_checklists     DISABLE ROW LEVEL SECURITY;
ALTER TABLE exit_requests             DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents        DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_features     DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 18. MIGRATIONS  (safe column additions for existing databases)
--     Each statement adds a column only if it doesn't exist yet.
-- ─────────────────────────────────────────────────────────────

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id        BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change  BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS clockify_user_id       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color           TEXT DEFAULT '#4F46E5';

-- attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS clockify_hours  NUMERIC DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS notes           TEXT;

-- leaves
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS leave_time       TEXT DEFAULT 'full';
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS half_type        TEXT;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS google_event_id  TEXT;

-- work_schedule
ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;

-- clockify_config
ALTER TABLE clockify_config ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;

-- holidays
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS specific_msg    TEXT;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- events
ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_id  TEXT;
