-- ============================================================
-- HRMS Full Migration — Run in Supabase SQL Editor
-- Adds all new HRMS tables and columns on top of existing schema
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ─── 1. Enhance users table with new HR fields ────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone              TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type    TEXT DEFAULT 'full-time';
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_status  TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_joining    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS confirmation_date  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_to       BIGINT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_ifsc           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url   TEXT;

-- ─── 2. Departments ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  head_user_id    BIGINT REFERENCES users(id),
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;

-- ─── 3. Designations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS designations (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  department_id   BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE designations DISABLE ROW LEVEL SECURITY;

-- link users to department/designation ids
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id   BIGINT REFERENCES departments(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation_id  BIGINT REFERENCES designations(id);

-- ─── 4. Leave Policies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policies (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       BIGINT,
  leave_type            TEXT NOT NULL,
  label                 TEXT NOT NULL,
  annual_quota          INTEGER DEFAULT 0,
  carry_forward         BOOLEAN DEFAULT FALSE,
  max_carry_forward     INTEGER DEFAULT 0,
  accrual_type          TEXT DEFAULT 'yearly',
  half_day_allowed      BOOLEAN DEFAULT TRUE,
  requires_approval     BOOLEAN DEFAULT TRUE,
  min_notice_days       INTEGER DEFAULT 0,
  max_consecutive_days  INTEGER DEFAULT 0,
  paid                  BOOLEAN DEFAULT TRUE,
  active                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE leave_policies DISABLE ROW LEVEL SECURITY;

-- ─── 5. Attendance Regularization ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_regularization (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  requested_check_in   TEXT,
  requested_check_out  TEXT,
  reason          TEXT NOT NULL,
  status          TEXT DEFAULT 'pending',
  reviewed_by     BIGINT REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  reviewer_notes  TEXT,
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE attendance_regularization DISABLE ROW LEVEL SECURITY;

-- ─── 6. In-App Notifications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  type            TEXT DEFAULT 'info',
  link            TEXT DEFAULT '',
  is_read         BOOLEAN DEFAULT FALSE,
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ─── 7. Employee Documents ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_documents (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT DEFAULT 'other',
  file_url        TEXT NOT NULL,
  file_type       TEXT DEFAULT '',
  file_size       INTEGER DEFAULT 0,
  expiry_date     TEXT,
  uploaded_by     BIGINT REFERENCES users(id),
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employee_documents DISABLE ROW LEVEL SECURITY;

-- ─── 8. Payroll Structure ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_structures (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from      TEXT NOT NULL,
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
  organization_id     BIGINT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE payroll_structures DISABLE ROW LEVEL SECURITY;

-- ─── 9. Payslips ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payslips (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month               TEXT NOT NULL,
  year                INTEGER NOT NULL,
  pay_period          TEXT NOT NULL,
  basic               NUMERIC DEFAULT 0,
  hra                 NUMERIC DEFAULT 0,
  da                  NUMERIC DEFAULT 0,
  transport_allowance NUMERIC DEFAULT 0,
  medical_allowance   NUMERIC DEFAULT 0,
  other_allowances    NUMERIC DEFAULT 0,
  gross_salary        NUMERIC DEFAULT 0,
  pf_employee         NUMERIC DEFAULT 0,
  esi_employee        NUMERIC DEFAULT 0,
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
  pf_employer         NUMERIC DEFAULT 0,
  esi_employer        NUMERIC DEFAULT 0,
  status              TEXT DEFAULT 'draft',
  notes               TEXT DEFAULT '',
  pdf_url             TEXT DEFAULT '',
  organization_id     BIGINT,
  generated_by        BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month, year)
);
ALTER TABLE payslips DISABLE ROW LEVEL SECURITY;

-- ─── 10. Assets ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id              BIGSERIAL PRIMARY KEY,
  asset_tag       TEXT NOT NULL,
  name            TEXT NOT NULL,
  category        TEXT DEFAULT 'other',
  brand           TEXT DEFAULT '',
  model           TEXT DEFAULT '',
  serial_number   TEXT DEFAULT '',
  condition       TEXT DEFAULT 'good',
  status          TEXT DEFAULT 'available',
  assigned_to     BIGINT REFERENCES users(id),
  assigned_at     TEXT,
  return_date     TEXT,
  notes           TEXT DEFAULT '',
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE assets DISABLE ROW LEVEL SECURITY;

-- ─── 11. Expenses ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  category        TEXT DEFAULT 'other',
  amount          NUMERIC NOT NULL,
  expense_date    TEXT NOT NULL,
  description     TEXT DEFAULT '',
  receipt_url     TEXT DEFAULT '',
  status          TEXT DEFAULT 'pending',
  reviewed_by     BIGINT REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  reviewer_notes  TEXT DEFAULT '',
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;

-- ─── 12. Announcements / Noticeboard ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  type            TEXT DEFAULT 'general',
  priority        TEXT DEFAULT 'normal',
  target_audience TEXT DEFAULT 'all',
  pinned          BOOLEAN DEFAULT FALSE,
  expires_at      TEXT,
  created_by      BIGINT REFERENCES users(id),
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;

-- ─── 13. Shifts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  color           TEXT DEFAULT '#3525cd',
  description     TEXT DEFAULT '',
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS shift_assignments (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id        BIGINT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
ALTER TABLE shift_assignments DISABLE ROW LEVEL SECURITY;

-- ─── 14. Performance Goals ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_goals (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  category        TEXT DEFAULT 'individual',
  target_date     TEXT,
  progress        INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active',
  review_cycle    TEXT DEFAULT '2026',
  created_by      BIGINT REFERENCES users(id),
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE performance_goals DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS performance_reviews (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id         BIGINT REFERENCES users(id),
  review_cycle        TEXT NOT NULL,
  review_type         TEXT DEFAULT 'annual',
  self_rating         NUMERIC,
  manager_rating      NUMERIC,
  final_rating        NUMERIC,
  self_comments       TEXT DEFAULT '',
  manager_comments    TEXT DEFAULT '',
  strengths           TEXT DEFAULT '',
  improvements        TEXT DEFAULT '',
  status              TEXT DEFAULT 'pending',
  organization_id     BIGINT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE performance_reviews DISABLE ROW LEVEL SECURITY;

-- ─── 15. Onboarding ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  due_date        TEXT,
  assigned_to     TEXT DEFAULT 'employee',
  completed       BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  order_index     INTEGER DEFAULT 0,
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE onboarding_checklists DISABLE ROW LEVEL SECURITY;

-- ─── 16. Exit Management ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exit_requests (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resignation_date      TEXT NOT NULL,
  last_working_day      TEXT,
  reason                TEXT DEFAULT '',
  notice_period_days    INTEGER DEFAULT 30,
  exit_interview_date   TEXT,
  exit_interview_done   BOOLEAN DEFAULT FALSE,
  exit_interview_notes  TEXT DEFAULT '',
  clearance_it          BOOLEAN DEFAULT FALSE,
  clearance_hr          BOOLEAN DEFAULT FALSE,
  clearance_finance     BOOLEAN DEFAULT FALSE,
  clearance_admin       BOOLEAN DEFAULT FALSE,
  status                TEXT DEFAULT 'pending',
  reviewed_by           BIGINT REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  organization_id       BIGINT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE exit_requests DISABLE ROW LEVEL SECURITY;

-- ─── 17. Holidays — add missing columns for multi-org ─────────────────────────
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS organization_id BIGINT;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS specific_msg   TEXT;

-- ─── 18. Events — add missing columns for multi-org ──────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- ─── 19. Leaves — add google_event_id if missing ─────────────────────────────
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS google_event_id  TEXT;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS organization_id  BIGINT;

-- ─── 20. Attendance — add organization_id if missing ─────────────────────────
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS organization_id BIGINT;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_user_id_date_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_user_org_date_key'
  ) THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_user_org_date_key UNIQUE(user_id, date, organization_id);
  END IF;
END $$;

-- ─── 21. Work schedule — add org_id if missing ───────────────────────────────
ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS organization_id BIGINT;

-- ─── 22. Push subscriptions (already may exist) ──────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  subscription    JSONB NOT NULL,
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY;

-- ─── DONE ────────────────────────────────────────────────────────────────────
-- After running this migration, seed default leave policies per org:
-- INSERT INTO leave_policies (organization_id, leave_type, label, annual_quota, carry_forward, paid)
-- VALUES
--   (YOUR_ORG_ID, 'annual',    'Annual Leave',    18, true,  true),
--   (YOUR_ORG_ID, 'sick',      'Sick Leave',      12, false, true),
--   (YOUR_ORG_ID, 'casual',    'Casual Leave',     8, false, true),
--   (YOUR_ORG_ID, 'emergency', 'Emergency Leave',  3, false, true),
--   (YOUR_ORG_ID, 'maternity', 'Maternity Leave', 180, false, true),
--   (YOUR_ORG_ID, 'paternity', 'Paternity Leave',  15, false, true),
--   (YOUR_ORG_ID, 'comp_off',  'Comp Off',          0, false, true);
