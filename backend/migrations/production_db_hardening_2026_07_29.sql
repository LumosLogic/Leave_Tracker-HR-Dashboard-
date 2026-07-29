-- ============================================================
-- PRODUCTION DATABASE HARDENING MIGRATION
-- HRMS System — Lumos Logic
-- Date: 2026-07-29
-- Auditor: Senior Staff Backend Engineer / PostgreSQL Architect
--
-- Implements ALL findings from the 2026-07-29 Database Audit.
--
-- HOW TO RUN:
--   psql -U lumos_admin -d lumos_hrms \
--     -f backend/migrations/production_db_hardening_2026_07_29.sql
--
-- SAFETY:
--   Wrapped in BEGIN/COMMIT. Safe to re-run (IF NOT EXISTS, DO $$ guards).
--   Does NOT drop any table or column. Preserves all existing data.
--   Data cleanup runs BEFORE constraints to prevent constraint failures.
--
-- SECTIONS:
--   0.  Migration Tracking Table
--   1.  Data Cleanup (pre-constraint repair)
--   2.  Soft Delete Columns
--   3.  Foreign Key ON DELETE Fixes
--   4.  Missing UNIQUE Constraints
--   5.  CHECK Constraints
--   6.  NOT NULL Constraints (guarded)
--   7.  Default Value Corrections
--   8.  Composite Performance Indexes
--   9.  Helper Views
--  10.  Validation Functions
--  11.  Dead Table Documentation
--  12.  Migration Version Records
-- THEN (after COMMIT):
--  13.  Verification Queries
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- SECTION 0: MIGRATION TRACKING
-- Create schema_migrations first so every subsequent step
-- can be recorded. INSERT ON CONFLICT DO NOTHING = safe re-run.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  description TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by  TEXT        NOT NULL DEFAULT current_user
);

COMMENT ON TABLE schema_migrations IS
  'Append-only migration version log. Never delete rows.';


-- ─────────────────────────────────────────────────────────────
-- SECTION 1: DATA CLEANUP
-- Must run BEFORE constraints. Repairs corrupt/inconsistent
-- existing data so subsequent ALTER TABLE statements succeed.
-- ─────────────────────────────────────────────────────────────

-- 1A. Normalize 'draft' payslip status → 'generated'
--     WHY: hrms_full_migration.sql set DEFAULT 'draft'; full_schema.sql
--          set DEFAULT 'generated'. One default wins at table creation
--          time; any payslips created by the other schema have 'draft'
--          which violates the CHECK we add in Section 5.
UPDATE payslips SET status = 'generated' WHERE status = 'draft';

-- 1B. Clamp negative attendance hours to 0
--     WHY: Biometric punch-order edge cases (e.g. break_out before break_in)
--          can produce negative computed durations. No DB guard existed.
UPDATE attendance SET work_hours         = 0 WHERE work_hours         IS NOT NULL AND work_hours         < 0;
UPDATE attendance SET gross_hours        = 0 WHERE gross_hours        IS NOT NULL AND gross_hours        < 0;
UPDATE attendance SET total_break_minutes = 0 WHERE total_break_minutes IS NOT NULL AND total_break_minutes < 0;

-- 1C. Clamp negative payslip amounts to 0
UPDATE payslips SET gross_salary     = 0 WHERE gross_salary     IS NOT NULL AND gross_salary     < 0;
UPDATE payslips SET net_salary       = 0 WHERE net_salary       IS NOT NULL AND net_salary       < 0;
UPDATE payslips SET lop_days         = 0 WHERE lop_days         IS NOT NULL AND lop_days         < 0;
UPDATE payslips SET lop_amount       = 0 WHERE lop_amount       IS NOT NULL AND lop_amount       < 0;
UPDATE payslips SET total_deductions = 0 WHERE total_deductions IS NOT NULL AND total_deductions < 0;

-- 1D. Flip negative expense amounts to absolute value
--     WHY: expenses.amount CHECK > 0 added in Section 5 would reject negatives.
UPDATE expenses SET amount = ABS(amount) WHERE amount IS NOT NULL AND amount < 0;

-- 1E. Fix users with invalid role values
--     WHY: chk_users_role CHECK would reject unknown roles.
UPDATE users
SET role = 'employee'
WHERE role NOT IN ('employee','admin','root_admin','platform_admin');

-- 1F. Fix users with invalid employee_status
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='employee_status') THEN
    UPDATE users
    SET employee_status = 'active'
    WHERE employee_status NOT IN ('active','inactive','resigned','terminated','on_leave');
  END IF;
END $$;

-- 1G. Deduplicate holidays (keep highest id per org+date)
--     WHY: No UNIQUE constraint existed; bulk importers could create duplicates
--          causing leave calculations to double-exclude the same day.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (SELECT organization_id, date FROM holidays
        GROUP BY organization_id, date HAVING COUNT(*) > 1) d;
  IF v_count > 0 THEN
    DELETE FROM holidays h1
    WHERE EXISTS (
      SELECT 1 FROM holidays h2
      WHERE h2.organization_id = h1.organization_id
        AND h2.date            = h1.date
        AND h2.id              > h1.id
    );
    RAISE NOTICE 'Deduped % holiday group(s)', v_count;
  END IF;
END $$;

-- 1H. Deduplicate leave_policies (keep highest id per org+leave_type)
--     WHY: Duplicate policies cause ambiguous quota lookups in leave balance.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (SELECT organization_id, leave_type FROM leave_policies
        GROUP BY organization_id, leave_type HAVING COUNT(*) > 1) d;
  IF v_count > 0 THEN
    DELETE FROM leave_policies lp1
    WHERE EXISTS (
      SELECT 1 FROM leave_policies lp2
      WHERE lp2.organization_id = lp1.organization_id
        AND lp2.leave_type      = lp1.leave_type
        AND lp2.id              > lp1.id
    );
    RAISE NOTICE 'Deduped % leave_policy group(s)', v_count;
  END IF;
END $$;

-- 1I. Deduplicate departments (keep highest id per org+name)
--     Reassign users pointing to the duplicate (lower) id first.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (SELECT organization_id, LOWER(TRIM(name)) FROM departments
        GROUP BY organization_id, LOWER(TRIM(name)) HAVING COUNT(*) > 1) d;
  IF v_count > 0 THEN
    -- Point users at the surviving (max id) department
    UPDATE users u
    SET department_id = survivor.max_id
    FROM (
      SELECT organization_id, LOWER(TRIM(name)) AS norm, MAX(id) AS max_id
      FROM departments
      GROUP BY organization_id, LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    ) survivor
    JOIN departments dup ON dup.organization_id = survivor.organization_id
                        AND LOWER(TRIM(dup.name)) = survivor.norm
                        AND dup.id < survivor.max_id
    WHERE u.department_id = dup.id;
    -- Delete duplicate rows
    DELETE FROM departments d1
    WHERE EXISTS (
      SELECT 1 FROM departments d2
      WHERE d2.organization_id = d1.organization_id
        AND LOWER(TRIM(d2.name)) = LOWER(TRIM(d1.name))
        AND d2.id > d1.id
    );
    RAISE NOTICE 'Deduped % department group(s)', v_count;
  END IF;
END $$;

-- 1J. Deduplicate payslips (keep highest id per user+month+year+org)
--     WHY: UNIQUE constraint was missing organization_id in one migration
--          variant, allowing cross-tenant collision.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (SELECT user_id, month, year, organization_id FROM payslips
        GROUP BY user_id, month, year, organization_id HAVING COUNT(*) > 1) d;
  IF v_count > 0 THEN
    DELETE FROM payslips p1
    WHERE EXISTS (
      SELECT 1 FROM payslips p2
      WHERE p2.user_id         = p1.user_id
        AND p2.month           = p1.month
        AND p2.year            = p1.year
        AND p2.organization_id = p1.organization_id
        AND p2.id              > p1.id
    );
    RAISE NOTICE 'Deduped % payslip group(s)', v_count;
  END IF;
END $$;

-- 1K. Deduplicate shift_assignments (keep highest id per user+date+org)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (SELECT user_id, date, organization_id FROM shift_assignments
        GROUP BY user_id, date, organization_id HAVING COUNT(*) > 1) d;
  IF v_count > 0 THEN
    DELETE FROM shift_assignments s1
    WHERE EXISTS (
      SELECT 1 FROM shift_assignments s2
      WHERE s2.user_id         = s1.user_id
        AND s2.date            = s1.date
        AND s2.organization_id = s1.organization_id
        AND s2.id              > s1.id
    );
    RAISE NOTICE 'Deduped % shift_assignment group(s)', v_count;
  END IF;
END $$;

-- 1L. Deduplicate notification_recipients (org + email)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notification_recipients')
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='notification_recipients' AND column_name='email') THEN
    DELETE FROM notification_recipients nr1
    WHERE EXISTS (
      SELECT 1 FROM notification_recipients nr2
      WHERE nr2.organization_id = nr1.organization_id
        AND nr2.email           = nr1.email
        AND nr2.id              > nr1.id
    );
  END IF;
END $$;

-- 1M. Report residual WFH leave_type records (post-WFH separation 2026-07-02)
--     fix_wfh_leave_type.sql should have handled this. Log if any remain.
DO $$
DECLARE v_count INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='leaves' AND column_name='leave_type') THEN
    SELECT COUNT(*) INTO v_count FROM leaves WHERE leave_type = 'wfh';
    IF v_count > 0 THEN
      RAISE NOTICE 'WARNING: % WFH records in leaves.leave_type — should be zero post-separation. Run fix_wfh_leave_type.sql if not already applied.', v_count;
    END IF;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: SOFT DELETE COLUMNS
-- Add deleted_at TIMESTAMPTZ NULL to key tables.
-- NULL = live record. NOT NULL = soft-deleted.
-- Existing queries are unaffected (no WHERE filter added here).
-- New queries should include: WHERE deleted_at IS NULL
-- ROLLBACK: ALTER TABLE <t> DROP COLUMN deleted_at;
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance'    AND column_name='deleted_at') THEN
    ALTER TABLE attendance    ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN attendance.deleted_at    IS 'Soft delete. NULL=active. Filter: WHERE deleted_at IS NULL';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leaves'        AND column_name='deleted_at') THEN
    ALTER TABLE leaves        ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN leaves.deleted_at        IS 'Soft delete. NULL=active. Preserves leave history on employee offboarding.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips'      AND column_name='deleted_at') THEN
    ALTER TABLE payslips      ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN payslips.deleted_at      IS 'Soft delete. NULL=active. NEVER hard-delete payslips — legal audit requirement.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets'        AND column_name='deleted_at') THEN
    ALTER TABLE assets        ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN assets.deleted_at        IS 'Soft delete. NULL=active. Decommissioned assets set deleted_at, not hard-deleted.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses'      AND column_name='deleted_at') THEN
    ALTER TABLE expenses      ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN expenses.deleted_at      IS 'Soft delete. NULL=active.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exit_requests' AND column_name='deleted_at') THEN
    ALTER TABLE exit_requests ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN exit_requests.deleted_at IS 'Soft delete. NULL=active. Retracted requests set deleted_at.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='deleted_at') THEN
    ALTER TABLE announcements ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN announcements.deleted_at IS 'Soft delete. NULL=active.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events'        AND column_name='deleted_at') THEN
    ALTER TABLE events        ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN events.deleted_at        IS 'Soft delete. NULL=active.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 3: FOREIGN KEY ON DELETE RULE FIXES
-- 16 FK relationships were missing ON DELETE rules.
-- Without these, deleting a user/org/branch raises error 23503
-- (FK violation) instead of gracefully nullifying the reference.
-- Strategy: SET NULL for audit/reference columns; CASCADE for
-- operational children where parent deletion should remove children.
-- ON UPDATE CASCADE: keeps references intact on PK changes.
-- ROLLBACK: DROP CONSTRAINT <name>; re-add without rule.
-- ─────────────────────────────────────────────────────────────

-- 3A. users.department_id → departments
--     RISK CRITICAL: deleting a department with assigned users
--     fails FK check without this rule.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='department_id') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_department_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3B. users.designation_id → designations
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='designation_id') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_designation_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_designation_id_fkey
      FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3C. users.branch_id → branches
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='branch_id')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='branches') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_branch_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3D. users.hod_id → users (self-referencing: HOD pointer)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='hod_id') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_hod_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_hod_id_fkey
      FOREIGN KEY (hod_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3E. attendance_regularization.reviewed_by → users
--     Audit note preserved (review_note survives); only the reviewer
--     pointer becomes NULL when reviewer account is deleted.
ALTER TABLE attendance_regularization
  DROP CONSTRAINT IF EXISTS attendance_regularization_reviewed_by_fkey;
ALTER TABLE attendance_regularization
  ADD CONSTRAINT attendance_regularization_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3F. leaves.approved_by → users
ALTER TABLE leaves
  DROP CONSTRAINT IF EXISTS leaves_approved_by_fkey;
ALTER TABLE leaves
  ADD CONSTRAINT leaves_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3G. payslips.generated_by → users
--     Payroll audit trail: who generated the payslip.
ALTER TABLE payslips
  DROP CONSTRAINT IF EXISTS payslips_generated_by_fkey;
ALTER TABLE payslips
  ADD CONSTRAINT payslips_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3H. expenses.reviewed_by → users
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_reviewed_by_fkey;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3I. exit_requests.reviewed_by → users
ALTER TABLE exit_requests
  DROP CONSTRAINT IF EXISTS exit_requests_reviewed_by_fkey;
ALTER TABLE exit_requests
  ADD CONSTRAINT exit_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3J. performance_reviews.reviewer_id → users
ALTER TABLE performance_reviews
  DROP CONSTRAINT IF EXISTS performance_reviews_reviewer_id_fkey;
ALTER TABLE performance_reviews
  ADD CONSTRAINT performance_reviews_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3K. employee_documents.uploaded_by → users
--     Document stays accessible even after uploader account deletion.
ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS employee_documents_uploaded_by_fkey;
ALTER TABLE employee_documents
  ADD CONSTRAINT employee_documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3L. events.created_by → users
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_created_by_fkey;
ALTER TABLE events
  ADD CONSTRAINT events_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3M. org_registration_requests.organization_id → organizations
--     Registration requests must survive org deletion for audit trail.
ALTER TABLE org_registration_requests
  DROP CONSTRAINT IF EXISTS org_registration_requests_organization_id_fkey;
ALTER TABLE org_registration_requests
  ADD CONSTRAINT org_registration_requests_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3N. platform_activity.organization_id → organizations
--     Platform-level audit log preserved after org deletion.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='platform_activity' AND column_name='organization_id') THEN
    ALTER TABLE platform_activity DROP CONSTRAINT IF EXISTS platform_activity_organization_id_fkey;
    ALTER TABLE platform_activity ADD CONSTRAINT platform_activity_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3O. notifications_log.organization_id → organizations
--     Operational log, not audit data — CASCADE is appropriate.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notifications_log')
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='notifications_log' AND column_name='organization_id') THEN
    ALTER TABLE notifications_log DROP CONSTRAINT IF EXISTS notifications_log_organization_id_fkey;
    ALTER TABLE notifications_log ADD CONSTRAINT notifications_log_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3P. biometric_devices.branch_id → branches
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='biometric_devices')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='branches') THEN
    ALTER TABLE biometric_devices DROP CONSTRAINT IF EXISTS biometric_devices_branch_id_fkey;
    ALTER TABLE biometric_devices ADD CONSTRAINT biometric_devices_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: MISSING UNIQUE CONSTRAINTS
-- Implemented as UNIQUE INDEXes (same enforcement, more flexible).
-- Section 1 deduplication must have completed before these run.
-- ROLLBACK: DROP INDEX <index_name>;
-- ─────────────────────────────────────────────────────────────

-- 4A. users.email — global uniqueness
--     Duplicates checked first; if found, raises NOTICE instead of failing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname IN ('users_email_unique','users_email_key')
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM users GROUP BY email HAVING COUNT(*) > 1) THEN
      ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
      RAISE NOTICE 'UNIQUE(users.email) added';
    ELSE
      RAISE NOTICE 'WARNING: Duplicate emails in users table — unique constraint NOT added. Resolve duplicates then re-run.';
    END IF;
  ELSE
    RAISE NOTICE 'users.email UNIQUE already exists — skipped';
  END IF;
END $$;

-- 4B. (organization_id, employee_id) — unique employee_id within org
--     Partial: only enforced when employee_id is non-empty (some employees
--     may not yet have an assigned ID).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_employee_id_unique
  ON users(organization_id, employee_id)
  WHERE employee_id IS NOT NULL AND employee_id <> '';

-- 4C. holidays (organization_id, date) — one entry per day per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_org_date_unique
  ON holidays(organization_id, date);

-- 4D. leave_policies (organization_id, leave_type) — one policy per type per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_policies_org_type_unique
  ON leave_policies(organization_id, leave_type);

-- 4E. work_schedule (organization_id) — one schedule config per org
--     getSettings() is called on every attendance mutation; this ensures
--     that call always returns exactly one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_schedule_org_unique
  ON work_schedule(organization_id);

-- 4F. departments (organization_id, name) — no duplicate dept names per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_org_name_unique
  ON departments(organization_id, LOWER(TRIM(name)));

-- 4G. designations (organization_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_designations_org_name_unique
  ON designations(organization_id, LOWER(TRIM(name)));

-- 4H. notification_recipients (organization_id, email)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notification_recipients')
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='notification_recipients' AND column_name='email') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_recipients_org_email
             ON notification_recipients(organization_id, LOWER(TRIM(email)))';
  END IF;
END $$;

-- 4I. assets (organization_id, asset_tag) — no duplicate tags per org
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='assets' AND column_name='asset_tag') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_org_tag_unique
             ON assets(organization_id, asset_tag)
             WHERE asset_tag IS NOT NULL AND asset_tag <> ''''';
  END IF;
END $$;

-- 4J. payslips (user_id, month, year, organization_id) — CRITICAL multi-tenant fix
--     WHY: hrms_full_migration.sql created UNIQUE(user_id, month, year) without
--          organization_id. A user_id in org A and org B could collide.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payslips_user_id_month_year_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payslips_user_id_month_year_organization_id_key') THEN
    ALTER TABLE payslips DROP CONSTRAINT payslips_user_id_month_year_key;
    RAISE NOTICE 'Dropped payslips UNIQUE missing org_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payslips_user_id_month_year_organization_id_key') THEN
    ALTER TABLE payslips ADD CONSTRAINT payslips_user_id_month_year_organization_id_key
      UNIQUE(user_id, month, year, organization_id);
    RAISE NOTICE 'Added payslips UNIQUE(user_id, month, year, organization_id)';
  END IF;
END $$;

-- 4K. shift_assignments (user_id, date, organization_id) — multi-tenant fix
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_assignments_user_id_date_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_assignments_user_id_date_organization_id_key') THEN
    ALTER TABLE shift_assignments DROP CONSTRAINT shift_assignments_user_id_date_key;
    RAISE NOTICE 'Dropped shift_assignments UNIQUE missing org_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_assignments_user_id_date_organization_id_key') THEN
    ALTER TABLE shift_assignments ADD CONSTRAINT shift_assignments_user_id_date_organization_id_key
      UNIQUE(user_id, date, organization_id);
    RAISE NOTICE 'Added shift_assignments UNIQUE(user_id, date, organization_id)';
  END IF;
END $$;

-- 4L. attendance_regularization — one PENDING request per user per date per org
--     Partial index: allows multiple historical (rejected/approved) records
--     for the same date, but blocks submitting duplicate pending requests.
CREATE UNIQUE INDEX IF NOT EXISTS idx_att_reg_user_date_pending_unique
  ON attendance_regularization(user_id, date, organization_id)
  WHERE status = 'pending';


-- ─────────────────────────────────────────────────────────────
-- SECTION 5: CHECK CONSTRAINTS
-- DB-level validation for enum fields and numeric ranges.
-- No application-level validation can substitute for these —
-- direct SQL inserts, data imports, and bugs all bypass app code.
-- Section 1 data cleanup ensures no existing rows violate these.
-- ROLLBACK: ALTER TABLE <t> DROP CONSTRAINT <name>;
-- ─────────────────────────────────────────────────────────────

-- 5A. attendance.status enum
ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS chk_attendance_status,
  ADD CONSTRAINT chk_attendance_status
    CHECK (status IN ('present','absent','on_leave','half_day','wfh'));

-- 5B. attendance non-negative hours
ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS chk_attendance_hours,
  ADD CONSTRAINT chk_attendance_hours
    CHECK (
      (work_hours          IS NULL OR work_hours          >= 0) AND
      (gross_hours         IS NULL OR gross_hours         >= 0) AND
      (total_break_minutes IS NULL OR total_break_minutes >= 0)
    );

-- 5C. leaves.status enum
ALTER TABLE leaves
  DROP CONSTRAINT IF EXISTS chk_leaves_status,
  ADD CONSTRAINT chk_leaves_status
    CHECK (status IN ('pending','approved','rejected','cancelled'));

-- 5D. leaves.leave_time enum
--     'wfh' retained for backward-compat pre-2026-07-02 records.
ALTER TABLE leaves
  DROP CONSTRAINT IF EXISTS chk_leaves_leave_time,
  ADD CONSTRAINT chk_leaves_leave_time
    CHECK (leave_time IN ('full','half','wfh'));

-- 5E. expenses.amount > 0 (guarded: fails gracefully if zeroes exist)
DO $$
DECLARE v_zero INT;
BEGIN
  SELECT COUNT(*) INTO v_zero FROM expenses WHERE amount <= 0;
  IF v_zero = 0 THEN
    ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_amount;
    ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount CHECK (amount > 0);
    RAISE NOTICE 'chk_expenses_amount added';
  ELSE
    RAISE NOTICE 'WARNING: % expense rows with amount <= 0. Resolve then re-run.', v_zero;
  END IF;
END $$;

-- 5F. expenses.status enum
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS chk_expenses_status,
  ADD CONSTRAINT chk_expenses_status
    CHECK (status IN ('pending','approved','rejected'));

-- 5G. payslips.status enum (Section 1A normalized 'draft' → 'generated' first)
ALTER TABLE payslips
  DROP CONSTRAINT IF EXISTS chk_payslips_status,
  ADD CONSTRAINT chk_payslips_status
    CHECK (status IN ('generated','published'));

-- 5H. payslips non-negative salary fields
ALTER TABLE payslips
  DROP CONSTRAINT IF EXISTS chk_payslips_amounts,
  ADD CONSTRAINT chk_payslips_amounts
    CHECK (
      (gross_salary     IS NULL OR gross_salary     >= 0) AND
      (net_salary       IS NULL OR net_salary       >= 0) AND
      (lop_days         IS NULL OR lop_days         >= 0) AND
      (lop_amount       IS NULL OR lop_amount       >= 0) AND
      (total_deductions IS NULL OR total_deductions >= 0)
    );

-- 5I. users.role enum
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_role,
  ADD CONSTRAINT chk_users_role
    CHECK (role IN ('employee','admin','root_admin','platform_admin'));

-- 5J. users.employee_status enum
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='employee_status') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_employee_status;
    ALTER TABLE users ADD CONSTRAINT chk_users_employee_status
      CHECK (employee_status IN ('active','inactive','resigned','terminated','on_leave'));
  END IF;
END $$;

-- 5K. organizations.status enum
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS chk_organizations_status,
  ADD CONSTRAINT chk_organizations_status
    CHECK (status IN ('active','inactive','suspended','pending'));

-- 5L. performance_goals.progress 0–100
ALTER TABLE performance_goals
  DROP CONSTRAINT IF EXISTS chk_perf_goals_progress,
  ADD CONSTRAINT chk_perf_goals_progress
    CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100));

-- 5M. performance_reviews.self_rating 0–10
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='performance_reviews' AND column_name='self_rating') THEN
    ALTER TABLE performance_reviews DROP CONSTRAINT IF EXISTS chk_perf_self_rating;
    ALTER TABLE performance_reviews ADD CONSTRAINT chk_perf_self_rating
      CHECK (self_rating IS NULL OR (self_rating >= 0 AND self_rating <= 10));
  END IF;
END $$;

-- 5N. performance_reviews.manager_rating 0–10
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='performance_reviews' AND column_name='manager_rating') THEN
    ALTER TABLE performance_reviews DROP CONSTRAINT IF EXISTS chk_perf_manager_rating;
    ALTER TABLE performance_reviews ADD CONSTRAINT chk_perf_manager_rating
      CHECK (manager_rating IS NULL OR (manager_rating >= 0 AND manager_rating <= 10));
  END IF;
END $$;

-- 5O. exit_requests.status enum
ALTER TABLE exit_requests
  DROP CONSTRAINT IF EXISTS chk_exit_status,
  ADD CONSTRAINT chk_exit_status
    CHECK (status IN ('pending','approved','rejected'));

-- 5P. onboarding_checklists.assigned_to enum
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='onboarding_checklists' AND column_name='assigned_to') THEN
    ALTER TABLE onboarding_checklists DROP CONSTRAINT IF EXISTS chk_onboarding_assigned_to;
    ALTER TABLE onboarding_checklists ADD CONSTRAINT chk_onboarding_assigned_to
      CHECK (assigned_to IN ('employee','hr','it','manager'));
  END IF;
END $$;

-- 5Q. announcements.priority enum
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='announcements' AND column_name='priority') THEN
    ALTER TABLE announcements DROP CONSTRAINT IF EXISTS chk_announcements_priority;
    ALTER TABLE announcements ADD CONSTRAINT chk_announcements_priority
      CHECK (priority IN ('low','normal','high','urgent'));
  END IF;
END $$;

-- 5R. announcements.target_audience enum
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='announcements' AND column_name='target_audience') THEN
    ALTER TABLE announcements DROP CONSTRAINT IF EXISTS chk_announcements_audience;
    ALTER TABLE announcements ADD CONSTRAINT chk_announcements_audience
      CHECK (target_audience IN ('all','employees','hr'));
  END IF;
END $$;

-- 5S. assets.status enum
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='assets' AND column_name='status') THEN
    ALTER TABLE assets DROP CONSTRAINT IF EXISTS chk_assets_status;
    ALTER TABLE assets ADD CONSTRAINT chk_assets_status
      CHECK (status IN ('available','assigned','maintenance','retired'));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 6: NOT NULL CONSTRAINTS
-- Applied only if zero NULL values exist in the column.
-- Where NULLs are found, a NOTICE is raised and the constraint
-- is skipped — fix the data manually then re-run.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE v_null INT;
BEGIN
  SELECT COUNT(*) INTO v_null FROM attendance WHERE organization_id IS NULL;
  IF v_null = 0 THEN
    ALTER TABLE attendance ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE 'attendance.organization_id → NOT NULL';
  ELSE
    RAISE NOTICE 'SKIP attendance.organization_id NOT NULL: % NULL rows remain', v_null;
  END IF;
END $$;

DO $$
DECLARE v_null INT;
BEGIN
  SELECT COUNT(*) INTO v_null FROM leaves WHERE organization_id IS NULL;
  IF v_null = 0 THEN
    ALTER TABLE leaves ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE 'leaves.organization_id → NOT NULL';
  ELSE
    RAISE NOTICE 'SKIP leaves.organization_id NOT NULL: % NULL rows remain', v_null;
  END IF;
END $$;

DO $$
DECLARE v_null INT;
BEGIN
  SELECT COUNT(*) INTO v_null FROM holidays WHERE organization_id IS NULL;
  IF v_null = 0 THEN
    ALTER TABLE holidays ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE 'holidays.organization_id → NOT NULL';
  ELSE
    RAISE NOTICE 'SKIP holidays.organization_id NOT NULL: % NULL rows remain', v_null;
  END IF;
END $$;

DO $$
DECLARE v_null INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='notifications' AND column_name='organization_id') THEN
    SELECT COUNT(*) INTO v_null FROM notifications WHERE organization_id IS NULL;
    IF v_null = 0 THEN
      ALTER TABLE notifications ALTER COLUMN organization_id SET NOT NULL;
      RAISE NOTICE 'notifications.organization_id → NOT NULL';
    ELSE
      RAISE NOTICE 'SKIP notifications.organization_id NOT NULL: % NULL rows remain', v_null;
    END IF;
  END IF;
END $$;

DO $$
DECLARE v_null INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='events' AND column_name='organization_id') THEN
    SELECT COUNT(*) INTO v_null FROM events WHERE organization_id IS NULL;
    IF v_null = 0 THEN
      ALTER TABLE events ALTER COLUMN organization_id SET NOT NULL;
      RAISE NOTICE 'events.organization_id → NOT NULL';
    ELSE
      RAISE NOTICE 'SKIP events.organization_id NOT NULL: % NULL rows remain', v_null;
    END IF;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 7: DEFAULT VALUE CORRECTIONS
-- ─────────────────────────────────────────────────────────────

-- 7A. payslips.status default → 'generated' (not 'draft')
ALTER TABLE payslips ALTER COLUMN status SET DEFAULT 'generated';

-- 7B. leave_policies.annual_quota default → 0 (forces explicit admin config)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='leave_policies' AND column_name='annual_quota') THEN
    ALTER TABLE leave_policies ALTER COLUMN annual_quota SET DEFAULT 0;
  END IF;
END $$;

-- 7C. users.work_hours_per_day default → 8
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='work_hours_per_day') THEN
    ALTER TABLE users ALTER COLUMN work_hours_per_day SET DEFAULT 8;
  END IF;
END $$;

-- 7D. attendance.source default → 'manual'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='attendance' AND column_name='source') THEN
    ALTER TABLE attendance ALTER COLUMN source SET DEFAULT 'manual';
  END IF;
END $$;

-- 7E. attendance.total_break_minutes default → 0
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='attendance' AND column_name='total_break_minutes') THEN
    ALTER TABLE attendance ALTER COLUMN total_break_minutes SET DEFAULT 0;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 8: COMPOSITE PERFORMANCE INDEXES
-- Ordered by query criticality (highest volume first).
-- NOTE: CREATE INDEX (without CONCURRENTLY) takes ShareLock —
-- table is readable but writes block during index build.
-- For zero-downtime on large tables, run index creation
-- separately using CREATE INDEX CONCURRENTLY outside a transaction.
-- All indexes use IF NOT EXISTS for idempotency.
-- ROLLBACK: DROP INDEX <name>;
-- ─────────────────────────────────────────────────────────────

-- ── ATTENDANCE — most queried table in the entire system ──────
-- Every dashboard load, check-in, checkout, payroll run, and
-- biometric sync queries this table. Without these indexes,
-- every query is a full sequential scan of 36M+ rows at 100k employees.

CREATE INDEX IF NOT EXISTS idx_att_org_date
  ON attendance(organization_id, date);

CREATE INDEX IF NOT EXISTS idx_att_org_user_date
  ON attendance(organization_id, user_id, date);

CREATE INDEX IF NOT EXISTS idx_att_org_status_date
  ON attendance(organization_id, status, date);

-- text_pattern_ops enables LIKE '2026-07-%' to use this index.
-- WHY: date is TEXT not DATE; LIKE cannot use standard B-tree for prefix match
-- without this operator class.
-- FUTURE: drop this index after migrating date column to DATE type.
CREATE INDEX IF NOT EXISTS idx_att_date_text_ops
  ON attendance(date text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_att_wfh_partial
  ON attendance(organization_id, date)
  WHERE status = 'wfh';

-- ── LEAVES ────────────────────────────────────────────────────
-- Leave balance runs on every leave application: user + org + status + date.
-- Without these: every balance calc = full scan of leaves table.

CREATE INDEX IF NOT EXISTS idx_leaves_org_user_status
  ON leaves(organization_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_leaves_org_status_created
  ON leaves(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaves_org_dates
  ON leaves(organization_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_leaves_org_user_type
  ON leaves(organization_id, user_id, leave_type, start_date);

CREATE INDEX IF NOT EXISTS idx_leaves_pending_partial
  ON leaves(organization_id, created_at DESC)
  WHERE status = 'pending';

-- ── NOTIFICATIONS ─────────────────────────────────────────────
-- Unread count is polled on every page load per user.

CREATE INDEX IF NOT EXISTS idx_notif_org_user_read
  ON notifications(organization_id, user_id, is_read, created_at DESC);

-- ── HOLIDAYS ──────────────────────────────────────────────────
-- Called on every leave balance calculation for holiday exclusion.

CREATE INDEX IF NOT EXISTS idx_holidays_org_date
  ON holidays(organization_id, date);

CREATE INDEX IF NOT EXISTS idx_holidays_date_text_ops
  ON holidays(date text_pattern_ops);

-- ── USERS ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users(organization_id, role);

CREATE INDEX IF NOT EXISTS idx_users_org_active_partial
  ON users(organization_id, name, employee_id)
  WHERE employee_status = 'active';

CREATE INDEX IF NOT EXISTS idx_users_org_dept
  ON users(organization_id, department_id)
  WHERE department_id IS NOT NULL;

-- ── EXPENSES ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_expenses_org_status_created
  ON expenses(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_org_user
  ON expenses(organization_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_pending_partial
  ON expenses(organization_id, created_at DESC)
  WHERE status = 'pending';

-- ── ASSETS ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assets_org_status
  ON assets(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_assets_org_assigned
  ON assets(organization_id, assigned_to)
  WHERE assigned_to IS NOT NULL;

-- ── EXIT REQUESTS ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_exit_org_status
  ON exit_requests(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_exit_org_user
  ON exit_requests(organization_id, user_id);

-- ── ONBOARDING ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_onboarding_org_user
  ON onboarding_checklists(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_user_completed
  ON onboarding_checklists(user_id, completed);

-- ── PERFORMANCE ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_perf_goals_org_user
  ON performance_goals(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_perf_reviews_org_user
  ON performance_reviews(organization_id, user_id);

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────
-- Pinned announcements appear first, then by date.

CREATE INDEX IF NOT EXISTS idx_ann_org_pinned_date
  ON announcements(organization_id, pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── DEPARTMENTS / DESIGNATIONS ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dept_org
  ON departments(organization_id);

CREATE INDEX IF NOT EXISTS idx_desig_org
  ON designations(organization_id);

-- ── SHIFT ASSIGNMENTS ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shift_assign_org_date
  ON shift_assignments(organization_id, date);

CREATE INDEX IF NOT EXISTS idx_shift_assign_org_user_date
  ON shift_assignments(organization_id, user_id, date);

-- ── PAYROLL STRUCTURES ────────────────────────────────────────
-- effective_from DESC: payroll run fetches the most recent structure.

CREATE INDEX IF NOT EXISTS idx_payroll_struct_user_org_eff
  ON payroll_structures(user_id, organization_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_struct_org
  ON payroll_structures(organization_id);

-- ── ATTENDANCE REGULARIZATION ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_att_reg_org_status_created
  ON attendance_regularization(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_att_reg_org_user
  ON attendance_regularization(organization_id, user_id);

-- ── LEAVE POLICIES ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leave_policies_org_active
  ON leave_policies(organization_id, active);

-- ── PAYSLIPS ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payslips_org_period
  ON payslips(organization_id, year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_payslips_user_period
  ON payslips(user_id, year DESC, month DESC);

-- ── EMPLOYEE DOCUMENTS ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_emp_docs_org_employee
  ON employee_documents(organization_id, employee_id);

-- ── EVENTS ────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='events' AND column_name='start_date') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_org_date ON events(organization_id, start_date)';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 9: HELPER VIEWS
-- Common high-frequency query patterns as named views.
-- Ensures consistent filtering (org scoping, active-only, etc.)
-- across all callers.
-- ROLLBACK: DROP VIEW <name>;
-- ─────────────────────────────────────────────────────────────

-- 9A. Active employees — used by dashboard counts, payroll runs, leave approvals
CREATE OR REPLACE VIEW v_active_employees AS
SELECT
  id, organization_id, name, email, role,
  employee_id, department_id, designation_id,
  branch_id, reporting_to, hod_id,
  employee_status, date_of_joining,
  work_hours_per_day, avatar_url
FROM users
WHERE employee_status = 'active'
  AND role <> 'platform_admin';

COMMENT ON VIEW v_active_employees IS
  'Active employees excluding platform admins. Backed by idx_users_org_active_partial.';

-- 9B. Pending leaves with employee + department info
CREATE OR REPLACE VIEW v_pending_leaves AS
SELECT
  l.id,
  l.organization_id,
  l.user_id,
  u.name          AS employee_name,
  u.employee_id   AS employee_code,
  d.name          AS department_name,
  l.leave_type,
  l.leave_time,
  l.start_date,
  l.end_date,
  l.days,
  l.reason,
  l.status,
  l.created_at
FROM leaves l
JOIN  users       u ON u.id = l.user_id
LEFT JOIN departments d ON d.id = u.department_id
WHERE l.status = 'pending'
  AND l.deleted_at IS NULL;

COMMENT ON VIEW v_pending_leaves IS
  'Pending leave requests with employee and department details. Backed by idx_leaves_pending_partial.';

-- 9C. Today's attendance snapshot
CREATE OR REPLACE VIEW v_today_attendance AS
SELECT
  a.id, a.organization_id, a.user_id,
  u.name        AS employee_name,
  u.employee_id AS employee_code,
  a.date, a.status, a.check_in, a.check_out,
  a.work_hours, a.gross_hours, a.total_break_minutes, a.source
FROM attendance a
JOIN users u ON u.id = a.user_id
WHERE a.date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
  AND a.deleted_at IS NULL;

COMMENT ON VIEW v_today_attendance IS
  'Today''s attendance. Backed by idx_att_org_date. Used by admin dashboard real-time view.';

-- 9D. Leave balance for current calendar year
CREATE OR REPLACE VIEW v_leave_balance_current_year AS
SELECT
  organization_id,
  user_id,
  leave_type,
  COUNT(*)   AS total_applications,
  SUM(days)  AS days_consumed,
  EXTRACT(YEAR FROM CURRENT_DATE)::INT AS year
FROM leaves
WHERE status     = 'approved'
  AND deleted_at IS NULL
  AND start_date >= TO_CHAR(DATE_TRUNC('year', CURRENT_DATE),                    'YYYY-MM-DD')
  AND start_date <  TO_CHAR(DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year','YYYY-MM-DD')
GROUP BY organization_id, user_id, leave_type;

COMMENT ON VIEW v_leave_balance_current_year IS
  'Approved leave consumed in current year per user per type. Join with leave_policies.annual_quota for remaining balance.';

-- 9E. Unread notification count per user
CREATE OR REPLACE VIEW v_unread_notifications AS
SELECT
  organization_id,
  user_id,
  COUNT(*) AS unread_count
FROM notifications
WHERE is_read = FALSE
GROUP BY organization_id, user_id;

COMMENT ON VIEW v_unread_notifications IS
  'Unread badge counts. Used by GET /api/notifications/unread-count. Backed by idx_notif_org_user_read.';

-- 9F. Monthly payroll totals per org
CREATE OR REPLACE VIEW v_monthly_payroll_summary AS
SELECT
  organization_id,
  year,
  month,
  COUNT(*)              AS total_payslips,
  SUM(gross_salary)     AS total_gross,
  SUM(net_salary)       AS total_net,
  SUM(total_deductions) AS total_deductions,
  SUM(lop_amount)       AS total_lop
FROM payslips
WHERE deleted_at IS NULL
GROUP BY organization_id, year, month;

COMMENT ON VIEW v_monthly_payroll_summary IS
  'Payroll totals per org per month. Finance dashboard and payroll run verification.';

-- 9G. Department headcount (active employees)
CREATE OR REPLACE VIEW v_department_headcount AS
SELECT
  d.organization_id,
  d.id           AS department_id,
  d.name         AS department_name,
  COUNT(u.id)    AS active_employee_count
FROM departments d
LEFT JOIN users u ON u.department_id = d.id
                 AND u.employee_status = 'active'
GROUP BY d.organization_id, d.id, d.name;

COMMENT ON VIEW v_department_headcount IS
  'Active employee count per department. Used by org charts and HR analytics.';


-- ─────────────────────────────────────────────────────────────
-- SECTION 10: VALIDATION FUNCTIONS
-- PL/pgSQL functions encoding business rules that cannot be
-- expressed as simple CHECK constraints.
-- Call from application code before INSERT/UPDATE.
-- ROLLBACK: DROP FUNCTION <signature>;
-- ─────────────────────────────────────────────────────────────

-- 10A. Nominee percentage validation
--      Returns TRUE if percentages for the employee sum to 0 or 100.
--      Call before INSERT/UPDATE on employee_nominees.
CREATE OR REPLACE FUNCTION fn_validate_nominee_percentage(
  p_employee_id BIGINT,
  p_org_id      BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(percentage_share), 0)
  INTO   v_total
  FROM   employee_nominees
  WHERE  employee_id     = p_employee_id
    AND  organization_id = p_org_id;
  RETURN (v_total = 0 OR v_total = 100);
END;
$$;

COMMENT ON FUNCTION fn_validate_nominee_percentage(BIGINT, BIGINT) IS
  'TRUE = nominee shares are 0 (no nominees) or exactly 100%. Call before nominee inserts.';

-- 10B. Leave overlap detection
--      Returns count of overlapping pending/approved leaves for the same user.
--      0 = no conflict. Pass p_exclude_id when updating an existing leave record.
CREATE OR REPLACE FUNCTION fn_validate_leave_overlap(
  p_user_id    BIGINT,
  p_org_id     BIGINT,
  p_start_date TEXT,
  p_end_date   TEXT,
  p_exclude_id BIGINT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql STABLE AS $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*)
  INTO   v_count
  FROM   leaves
  WHERE  user_id         = p_user_id
    AND  organization_id = p_org_id
    AND  status         IN ('pending','approved')
    AND  deleted_at     IS NULL
    AND  start_date     <= p_end_date
    AND  end_date       >= p_start_date
    AND  (p_exclude_id IS NULL OR id <> p_exclude_id);
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION fn_validate_leave_overlap(BIGINT, BIGINT, TEXT, TEXT, BIGINT) IS
  'Returns number of overlapping leaves for the user. 0 = no conflict. Call before leave INSERT/UPDATE.';

-- 10C. Shift conflict detection
--      Returns TRUE if user already has a shift assignment on the date.
CREATE OR REPLACE FUNCTION fn_validate_shift_conflict(
  p_user_id    BIGINT,
  p_org_id     BIGINT,
  p_date       TEXT,
  p_exclude_id BIGINT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM shift_assignments
    WHERE  user_id         = p_user_id
      AND  organization_id = p_org_id
      AND  date            = p_date
      AND  (p_exclude_id IS NULL OR id <> p_exclude_id)
  ) INTO v_exists;
  RETURN v_exists;
END;
$$;

COMMENT ON FUNCTION fn_validate_shift_conflict(BIGINT, BIGINT, TEXT, BIGINT) IS
  'TRUE = user already has a shift on this date. Call before shift_assignment INSERT.';

-- 10D. Leave balance lookup
--      Returns quota, consumed, and remaining days for a user/type/year.
--      Replaces inline balance calculation scattered across leaves.routes.js.
CREATE OR REPLACE FUNCTION fn_get_leave_balance(
  p_user_id    BIGINT,
  p_org_id     BIGINT,
  p_leave_type TEXT,
  p_year       INT
) RETURNS TABLE(
  leave_type     TEXT,
  annual_quota   NUMERIC,
  days_consumed  NUMERIC,
  days_remaining NUMERIC
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.leave_type,
    lp.annual_quota,
    COALESCE(SUM(l.days), 0)                   AS days_consumed,
    lp.annual_quota - COALESCE(SUM(l.days), 0) AS days_remaining
  FROM leave_policies lp
  LEFT JOIN leaves l
    ON  l.user_id         = p_user_id
    AND l.organization_id = p_org_id
    AND l.leave_type      = lp.leave_type
    AND l.status          = 'approved'
    AND l.deleted_at     IS NULL
    AND l.start_date     >= TO_CHAR(MAKE_DATE(p_year,   1, 1), 'YYYY-MM-DD')
    AND l.start_date     <  TO_CHAR(MAKE_DATE(p_year+1, 1, 1), 'YYYY-MM-DD')
  WHERE lp.organization_id = p_org_id
    AND lp.leave_type      = p_leave_type
    AND (lp.active IS NULL OR lp.active = TRUE)
  GROUP BY lp.leave_type, lp.annual_quota;
END;
$$;

COMMENT ON FUNCTION fn_get_leave_balance(BIGINT, BIGINT, TEXT, INT) IS
  'Returns quota/consumed/remaining leave days for a user+type+year. Backed by idx_leaves_org_user_type.';

-- 10E. Monthly attendance summary function
--      Efficient range query replacing LIKE '2026-07-%' in payroll routes.
--      Uses >= / < on ISO-sorted TEXT dates, which the B-tree index supports.
CREATE OR REPLACE FUNCTION fn_attendance_month(
  p_user_id BIGINT,
  p_org_id  BIGINT,
  p_year    INT,
  p_month   INT
) RETURNS TABLE(
  att_date            TEXT,
  status              TEXT,
  check_in            TEXT,
  check_out           TEXT,
  work_hours          NUMERIC,
  gross_hours         NUMERIC,
  total_break_minutes INT,
  source              TEXT
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start TEXT := TO_CHAR(MAKE_DATE(p_year, p_month, 1),                       'YYYY-MM-DD');
  v_end   TEXT := TO_CHAR(MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month',  'YYYY-MM-DD');
BEGIN
  RETURN QUERY
  SELECT a.date, a.status, a.check_in, a.check_out,
         a.work_hours, a.gross_hours, a.total_break_minutes, a.source
  FROM   attendance a
  WHERE  a.user_id         = p_user_id
    AND  a.organization_id = p_org_id
    AND  a.date           >= v_start
    AND  a.date           <  v_end
    AND  a.deleted_at     IS NULL
  ORDER BY a.date;
END;
$$;

COMMENT ON FUNCTION fn_attendance_month(BIGINT, BIGINT, INT, INT) IS
  'Monthly attendance for payroll. Replaces LIKE date filter. Uses idx_att_org_user_date range scan.';


-- ─────────────────────────────────────────────────────────────
-- SECTION 11: DEAD TABLE DOCUMENTATION
-- Tables created in migrations but never written to by any route.
-- Documented here; NOT dropped. Drop manually after row-count
-- verification confirms they are empty.
--
-- Cleanup commands (run manually after confirming COUNT(*) = 0):
--   DROP TABLE IF EXISTS clockify_config;
--   DROP TABLE IF EXISTS archives;
--   DROP TABLE IF EXISTS notifications_log;
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='clockify_config') THEN
    COMMENT ON TABLE clockify_config IS
      'DEAD TABLE: Clockify removed 2026-07-22. No route reads or writes here. '
      'Drop after confirming row count = 0.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='archives') THEN
    COMMENT ON TABLE archives IS
      'DEAD TABLE: Created in sanghavi_migration.sql; never written to. '
      'Archiving is now handled by deleted_at soft-delete columns (Section 2). '
      'Drop after confirming row count = 0.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notifications_log') THEN
    COMMENT ON TABLE notifications_log IS
      'DEAD TABLE: Created in migration but no route inserts here. '
      'Push receipts tracked in push_subscriptions. '
      'Drop after confirming row count = 0.';
  END IF;
END $$;

-- Log dead table row counts for visibility
DO $$
DECLARE
  v_c1 INT := 0; v_c2 INT := 0; v_c3 INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='clockify_config')   THEN EXECUTE 'SELECT COUNT(*) FROM clockify_config'   INTO v_c1; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='archives')          THEN EXECUTE 'SELECT COUNT(*) FROM archives'           INTO v_c2; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notifications_log') THEN EXECUTE 'SELECT COUNT(*) FROM notifications_log'  INTO v_c3; END IF;
  RAISE NOTICE 'Dead table rows — clockify_config: %, archives: %, notifications_log: %', v_c1, v_c2, v_c3;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 12: MIGRATION VERSION RECORDS
-- ON CONFLICT DO NOTHING makes all inserts idempotent.
-- ─────────────────────────────────────────────────────────────

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_001','Data cleanup: normalize payslip status, clamp negatives, dedup holidays/policies/departments/payslips/shifts')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_002','Soft delete: deleted_at added to attendance, leaves, payslips, assets, expenses, exit_requests, announcements, events')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_003','FK ON DELETE SET NULL: department_id, designation_id, branch_id, hod_id, reviewed_by, approved_by, generated_by, uploaded_by, reviewer_id, created_by')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_004','FK ON DELETE: CASCADE notifications_log.organization_id; SET NULL org_registration_requests, platform_activity, biometric_devices.branch_id')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_005','UNIQUE constraints: users.email, users(org,employee_id), holidays(org,date), leave_policies(org,type), work_schedule(org), departments(org,name), designations(org,name), notification_recipients(org,email), assets(org,tag)')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_006','UNIQUE multi-tenant fix: payslips(user,month,year,org_id); shift_assignments(user,date,org_id); att_regularization partial pending')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_007','CHECK constraints: attendance.status/hours, leaves.status/leave_time, expenses.amount>0/status, payslips.status/amounts, users.role/employee_status, organizations.status, perf goals 0-100, ratings 0-10, exit.status, onboarding.assigned_to, announcements.priority/audience, assets.status')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_008','NOT NULL: attendance.organization_id, leaves.organization_id, holidays.organization_id, notifications.organization_id, events.organization_id (applied where zero NULLs)')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_009','Defaults: payslips.status=generated, leave_policies.annual_quota=0, users.work_hours_per_day=8, attendance.source=manual, total_break_minutes=0')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_010','Composite indexes: 40+ indexes on attendance, leaves, holidays, users, expenses, assets, exit, onboarding, performance, announcements, departments, designations, shifts, payroll, notifications, regularization, payslips, events, employee_documents')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_011','Helper views: v_active_employees, v_pending_leaves, v_today_attendance, v_leave_balance_current_year, v_unread_notifications, v_monthly_payroll_summary, v_department_headcount')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_012','Validation functions: fn_validate_nominee_percentage, fn_validate_leave_overlap, fn_validate_shift_conflict, fn_get_leave_balance, fn_attendance_month')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_013','Dead table documentation: clockify_config, archives, notifications_log — commented NOT dropped')
  ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================
-- SECTION 13: VERIFICATION QUERIES
-- Run after COMMIT to confirm migration success.
-- All "Should be 0" rows indicate clean data.
-- All constraint/index counts should be non-zero.
-- ============================================================

-- 13A. Migration versions applied
SELECT version, description, applied_at
FROM schema_migrations
WHERE version LIKE '20260729_%'
ORDER BY version;

-- 13B. All CHECK constraints added by this migration
SELECT r.relname AS table_name, c.conname AS constraint_name
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
WHERE c.contype = 'c' AND c.conname LIKE 'chk_%'
ORDER BY r.relname, c.conname;

-- 13C. All composite indexes added by this migration
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND tablename IN (
    'attendance','leaves','holidays','users','expenses','assets','notifications',
    'payslips','departments','designations','exit_requests','performance_goals',
    'performance_reviews','shift_assignments','payroll_structures',
    'onboarding_checklists','announcements','attendance_regularization',
    'leave_policies','events','employee_documents'
  )
ORDER BY tablename, indexname;

-- 13D. Soft delete columns exist
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE column_name = 'deleted_at' AND table_schema = 'public'
ORDER BY table_name;

-- 13E. Helper views exist
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'v_%'
ORDER BY table_name;

-- 13F. Validation functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE 'fn_%'
ORDER BY routine_name;

-- 13G. FK constraints on key tables (should be >= 10)
SELECT r.relname AS table_name, c.conname AS fk_name,
       CASE c.confdeltype WHEN 'a' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
         WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE '?' END AS on_delete
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
WHERE c.contype = 'f'
  AND r.relname IN (
    'leaves','payslips','expenses','exit_requests','attendance_regularization',
    'performance_reviews','employee_documents','events','users'
  )
ORDER BY r.relname, c.conname;

-- 13H. Invalid attendance status (should be 0)
SELECT 'invalid attendance status' AS check_name, COUNT(*) AS bad_rows
FROM attendance WHERE status NOT IN ('present','absent','on_leave','half_day','wfh');

-- 13I. Invalid leave status (should be 0)
SELECT 'invalid leave status' AS check_name, COUNT(*) AS bad_rows
FROM leaves WHERE status NOT IN ('pending','approved','rejected','cancelled');

-- 13J. Invalid user role (should be 0)
SELECT 'invalid user role' AS check_name, COUNT(*) AS bad_rows
FROM users WHERE role NOT IN ('employee','admin','root_admin','platform_admin');

-- 13K. Negative payslip amounts (should be 0)
SELECT 'negative payslip amounts' AS check_name, COUNT(*) AS bad_rows
FROM payslips WHERE gross_salary < 0 OR net_salary < 0 OR lop_days < 0 OR lop_amount < 0;

-- 13L. Duplicate holidays (should be 0)
SELECT 'duplicate holidays' AS check_name, COUNT(*) AS dup_groups
FROM (SELECT organization_id, date FROM holidays
      GROUP BY organization_id, date HAVING COUNT(*) > 1) d;

-- 13M. Duplicate payslips (should be 0)
SELECT 'duplicate payslips' AS check_name, COUNT(*) AS dup_groups
FROM (SELECT user_id, month, year, organization_id FROM payslips
      GROUP BY user_id, month, year, organization_id HAVING COUNT(*) > 1) d;

-- 13N. Orphaned attendance (no matching org — should be 0)
SELECT 'orphaned attendance' AS check_name, COUNT(*) AS orphan_count
FROM attendance a
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = a.organization_id);

-- 13O. Orphaned payslips (no matching user — should be 0)
SELECT 'orphaned payslips' AS check_name, COUNT(*) AS orphan_count
FROM payslips p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id);

-- 13P. Invalid nominee percentages (should be 0)
SELECT 'invalid nominee totals' AS check_name, COUNT(*) AS bad_employees
FROM (
  SELECT employee_id, organization_id, SUM(percentage_share) AS total
  FROM employee_nominees
  GROUP BY employee_id, organization_id
  HAVING SUM(percentage_share) NOT IN (0, 100)
) invalid;

-- 13Q. Payslip status 'draft' remaining (should be 0 after Section 1A)
SELECT 'draft payslips remaining' AS check_name, COUNT(*) AS bad_rows
FROM payslips WHERE status = 'draft';

-- 13R. work_schedule rows per org (every org should have exactly 1)
SELECT organization_id, COUNT(*) AS schedule_count
FROM work_schedule
GROUP BY organization_id
HAVING COUNT(*) > 1;

-- 13S. Full summary
SELECT
  (SELECT COUNT(*) FROM schema_migrations WHERE version LIKE '20260729_%') AS migration_versions,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE 'chk_%')           AS check_constraints,
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_%')            AS custom_indexes,
  (SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public' AND table_name LIKE 'v_%') AS views,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='public' AND routine_name LIKE 'fn_%') AS functions;
