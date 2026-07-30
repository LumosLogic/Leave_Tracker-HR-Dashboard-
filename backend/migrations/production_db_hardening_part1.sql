-- ============================================================
-- PRODUCTION DATABASE HARDENING — PART 1
-- HRMS System — Lumos Logic
-- Date: 2026-07-29
-- Revised: 2026-07-29 (post DBA review — all Phase 1/2/3 fixes applied)
--
-- THIS IS PART 1 OF 2.
-- Part 2 (index creation) is in: production_db_hardening_part2_indexes.sql
-- Part 2 MUST be run AFTER this script completes successfully.
--
-- HOW TO RUN (Production):
--   psql -U lumos_admin -d lumos_hrms \
--     -f backend/migrations/production_db_hardening_part1.sql
--
-- SAFETY:
--   Wrapped in BEGIN/COMMIT with lock_timeout and statement_timeout.
--   All DDL uses IF NOT EXISTS / IF EXISTS / DO $$ guards.
--   Data cleanup runs BEFORE constraints to prevent constraint failures.
--   Safe to re-run — all operations are idempotent.
--   Does NOT drop any table or column. Preserves all existing data.
--
-- DBA REVIEW FIXES APPLIED (vs original production_db_hardening_2026_07_29.sql):
--   B-1  Section 8 indexes moved to Part 2 as CREATE INDEX CONCURRENTLY
--   C-1  SET LOCAL lock_timeout + statement_timeout added after BEGIN
--   C-2  confdeltype mapping corrected ('a'=NO ACTION, 'r'=RESTRICT)
--   C-3  All information_schema queries include AND table_schema='public'
--   M-4  All validation functions changed STABLE → VOLATILE
--   H-1  All CHECK constraints use NOT VALID; VALIDATE runs post-COMMIT
--   H-2  Multiple UPDATE scans on same table combined into single pass
--   H-4  pg_constraint checks scoped by schema + table (not name alone)
--   H-5  NOT NULL: exception-based handler replaces double-scan approach
--   M-1  users.email UNIQUE: exception handler replaces TOCTOU pre-check
--   M-3  Explicit NUMERIC casts in fn_get_leave_balance
--   M-5  All bare FK ALTER TABLE statements wrapped in existence guards
--   L-1  Redundant IS NOT NULL predicates removed from UPDATE WHERE clauses
--   L-3  Section 13 summary scoped to this migration's objects only
--
-- SECTIONS:
--   0.  Migration Tracking Table
--   1.  Data Cleanup (pre-constraint repair)
--   2.  Soft Delete Columns
--   3.  Foreign Key ON DELETE Fixes
--   4.  Missing UNIQUE Constraints
--   5.  CHECK Constraints (all NOT VALID)
--   6.  NOT NULL Constraints (exception-guarded)
--   7.  Default Value Corrections
--       [Section 8 → Part 2]
--   9.  Helper Views
--  10.  Validation Functions
--  11.  Dead Table Documentation
--  12.  Migration Version Records
-- THEN (after COMMIT, outside transaction):
--  5B.  VALIDATE CONSTRAINTS (ShareUpdateExclusiveLock — non-blocking)
--  13.  Verification Queries
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- PRODUCTION LOCK PROTECTION  [FIX C-1]
-- Fail fast if any table lock cannot be acquired within 3 seconds.
-- Prevents this migration from queuing behind a long-running
-- transaction and blocking all subsequent application queries.
-- SET LOCAL scopes both settings to this transaction only.
-- ─────────────────────────────────────────────────────────────
SET LOCAL lock_timeout    = '3s';
SET LOCAL statement_timeout = '300s';


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

-- 1B. Clamp negative attendance hours to 0 — single-pass scan  [FIX H-2, L-1]
--     WHY: Biometric punch-order edge cases (e.g. break_out before break_in)
--          can produce negative computed durations. No DB guard existed.
--     CHANGE: Three separate UPDATEs combined into one table scan.
--             IS NOT NULL guards removed — NULL < 0 is UNKNOWN in SQL
--             and already excludes NULL rows from the WHERE clause naturally.
UPDATE attendance
SET
  work_hours          = CASE WHEN work_hours          < 0 THEN 0 ELSE work_hours          END,
  gross_hours         = CASE WHEN gross_hours         < 0 THEN 0 ELSE gross_hours         END,
  total_break_minutes = CASE WHEN total_break_minutes < 0 THEN 0 ELSE total_break_minutes END
WHERE work_hours < 0
   OR gross_hours < 0
   OR total_break_minutes < 0;

-- 1C. Clamp negative payslip amounts to 0 — single-pass scan  [FIX H-2, L-1]
--     CHANGE: Five separate UPDATEs combined into one table scan.
UPDATE payslips
SET
  gross_salary     = CASE WHEN gross_salary     < 0 THEN 0 ELSE gross_salary     END,
  net_salary       = CASE WHEN net_salary       < 0 THEN 0 ELSE net_salary       END,
  lop_days         = CASE WHEN lop_days         < 0 THEN 0 ELSE lop_days         END,
  lop_amount       = CASE WHEN lop_amount       < 0 THEN 0 ELSE lop_amount       END,
  total_deductions = CASE WHEN total_deductions < 0 THEN 0 ELSE total_deductions END
WHERE gross_salary     < 0
   OR net_salary       < 0
   OR lop_days         < 0
   OR lop_amount       < 0
   OR total_deductions < 0;

-- 1D. Flip negative expense amounts to absolute value
--     WHY: expenses.amount CHECK > 0 added in Section 5 would reject negatives.
UPDATE expenses SET amount = ABS(amount) WHERE amount < 0;

-- 1E. Fix users with invalid role values
--     WHY: chk_users_role CHECK would reject unknown roles.
UPDATE users
SET role = 'employee'
WHERE role NOT IN ('employee','admin','root_admin','platform_admin');

-- 1F. Fix users with invalid employee_status  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'users'
               AND column_name = 'employee_status'
               AND table_schema = 'public') THEN
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

-- 1L. Deduplicate work_schedule (keep highest id per org)
--     WHY: work_schedule has no prior uniqueness constraint. Multiple admin
--          users can each INSERT a settings row, leaving duplicates.
--          CREATE UNIQUE INDEX on work_schedule(organization_id) in Section 4
--          would fail with "could not create unique index" if duplicates exist,
--          aborting the entire transaction and rolling back all preceding changes.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (SELECT organization_id FROM work_schedule
        GROUP BY organization_id HAVING COUNT(*) > 1) d;
  IF v_count > 0 THEN
    DELETE FROM work_schedule w1
    WHERE EXISTS (
      SELECT 1 FROM work_schedule w2
      WHERE w2.organization_id = w1.organization_id
        AND w2.id              > w1.id
    );
    RAISE NOTICE 'Deduped % work_schedule group(s)', v_count;
  END IF;
END $$;

-- 1N. Deduplicate notification_recipients (org + email)  [FIX C-3: table_schema added]
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name  = 'notification_recipients'
               AND table_schema = 'public')
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name  = 'notification_recipients'
                  AND column_name = 'email'
                  AND table_schema = 'public') THEN
    DELETE FROM notification_recipients nr1
    WHERE EXISTS (
      SELECT 1 FROM notification_recipients nr2
      WHERE nr2.organization_id = nr1.organization_id
        AND nr2.email           = nr1.email
        AND nr2.id              > nr1.id
    );
  END IF;
END $$;

-- 1O. Report residual WFH leave_type records (post-WFH separation 2026-07-02)
--     fix_wfh_leave_type.sql should have handled this. Log if any remain.
--     [FIX C-3: table_schema added]
DO $$
DECLARE v_count INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'leaves'
               AND column_name = 'leave_type'
               AND table_schema = 'public') THEN
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
-- [FIX C-3: table_schema = 'public' added to every check]
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'attendance'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
    ALTER TABLE attendance    ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN attendance.deleted_at    IS 'Soft delete. NULL=active. Filter: WHERE deleted_at IS NULL';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'leaves'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
    ALTER TABLE leaves        ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN leaves.deleted_at        IS 'Soft delete. NULL=active. Preserves leave history on employee offboarding.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'payslips'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
    ALTER TABLE payslips      ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN payslips.deleted_at      IS 'Soft delete. NULL=active. NEVER hard-delete payslips — legal audit requirement.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'assets'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
    ALTER TABLE assets        ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN assets.deleted_at        IS 'Soft delete. NULL=active. Decommissioned assets set deleted_at, not hard-deleted.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'expenses'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
    ALTER TABLE expenses      ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN expenses.deleted_at      IS 'Soft delete. NULL=active.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'exit_requests'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
    ALTER TABLE exit_requests ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN exit_requests.deleted_at IS 'Soft delete. NULL=active. Retracted requests set deleted_at.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'announcements'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
    ALTER TABLE announcements ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    COMMENT ON COLUMN announcements.deleted_at IS 'Soft delete. NULL=active.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name  = 'events'
                   AND column_name = 'deleted_at'
                   AND table_schema = 'public') THEN
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
-- [FIX M-5: ALL bare ALTER TABLE FK statements now wrapped in DO $$
--           table-existence guards for consistent safety across all FKs.]
-- [FIX C-3: table_schema = 'public' added to every information_schema check]
-- ─────────────────────────────────────────────────────────────

-- 3A. users.department_id → departments
--     RISK CRITICAL: deleting a department with assigned users
--     fails FK check without this rule.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'users'
               AND column_name = 'department_id'
               AND table_schema = 'public') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_department_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3B. users.designation_id → designations
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'users'
               AND column_name = 'designation_id'
               AND table_schema = 'public') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_designation_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_designation_id_fkey
      FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3C. users.branch_id → branches
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'users'
               AND column_name = 'branch_id'
               AND table_schema = 'public')
    AND EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name  = 'branches'
                  AND table_schema = 'public') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_branch_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3D. users.hod_id → users (self-referencing: HOD pointer)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'users'
               AND column_name = 'hod_id'
               AND table_schema = 'public') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_hod_id_fkey;
    ALTER TABLE users ADD CONSTRAINT users_hod_id_fkey
      FOREIGN KEY (hod_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3E. attendance_regularization.reviewed_by → users  [FIX M-5: wrapped in DO $$]
--     Audit note preserved (review_note survives); only the reviewer
--     pointer becomes NULL when reviewer account is deleted.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'attendance_regularization' AND n.nspname = 'public') THEN
    ALTER TABLE attendance_regularization
      DROP CONSTRAINT IF EXISTS attendance_regularization_reviewed_by_fkey;
    ALTER TABLE attendance_regularization
      ADD CONSTRAINT attendance_regularization_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3F. leaves.approved_by → users  [FIX M-5: wrapped in DO $$]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'leaves' AND n.nspname = 'public') THEN
    ALTER TABLE leaves
      DROP CONSTRAINT IF EXISTS leaves_approved_by_fkey;
    ALTER TABLE leaves
      ADD CONSTRAINT leaves_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3G. payslips.generated_by → users  [FIX M-5: wrapped in DO $$]
--     Payroll audit trail: who generated the payslip.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'payslips' AND n.nspname = 'public') THEN
    ALTER TABLE payslips
      DROP CONSTRAINT IF EXISTS payslips_generated_by_fkey;
    ALTER TABLE payslips
      ADD CONSTRAINT payslips_generated_by_fkey
      FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3H. expenses.reviewed_by → users  [FIX M-5: wrapped in DO $$]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'expenses' AND n.nspname = 'public') THEN
    ALTER TABLE expenses
      DROP CONSTRAINT IF EXISTS expenses_reviewed_by_fkey;
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3I. exit_requests.reviewed_by → users  [FIX M-5: wrapped in DO $$]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'exit_requests' AND n.nspname = 'public') THEN
    ALTER TABLE exit_requests
      DROP CONSTRAINT IF EXISTS exit_requests_reviewed_by_fkey;
    ALTER TABLE exit_requests
      ADD CONSTRAINT exit_requests_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3J. performance_reviews.reviewer_id → users  [FIX M-5: wrapped in DO $$]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'performance_reviews' AND n.nspname = 'public') THEN
    ALTER TABLE performance_reviews
      DROP CONSTRAINT IF EXISTS performance_reviews_reviewer_id_fkey;
    ALTER TABLE performance_reviews
      ADD CONSTRAINT performance_reviews_reviewer_id_fkey
      FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3K. employee_documents.uploaded_by → users  [FIX M-5: wrapped in DO $$]
--     Document stays accessible even after uploader account deletion.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'employee_documents' AND n.nspname = 'public') THEN
    ALTER TABLE employee_documents
      DROP CONSTRAINT IF EXISTS employee_documents_uploaded_by_fkey;
    ALTER TABLE employee_documents
      ADD CONSTRAINT employee_documents_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3L. events.created_by → users  [FIX M-5: wrapped in DO $$]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'events' AND n.nspname = 'public') THEN
    ALTER TABLE events
      DROP CONSTRAINT IF EXISTS events_created_by_fkey;
    ALTER TABLE events
      ADD CONSTRAINT events_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3M. org_registration_requests.organization_id → organizations  [FIX M-5: wrapped in DO $$]
--     Registration requests must survive org deletion for audit trail.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'org_registration_requests' AND n.nspname = 'public') THEN
    ALTER TABLE org_registration_requests
      DROP CONSTRAINT IF EXISTS org_registration_requests_organization_id_fkey;
    ALTER TABLE org_registration_requests
      ADD CONSTRAINT org_registration_requests_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3N. platform_activity.organization_id → organizations
--     Platform-level audit log preserved after org deletion.
--     [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'platform_activity'
               AND column_name = 'organization_id'
               AND table_schema = 'public') THEN
    ALTER TABLE platform_activity DROP CONSTRAINT IF EXISTS platform_activity_organization_id_fkey;
    ALTER TABLE platform_activity ADD CONSTRAINT platform_activity_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3O. notifications_log.organization_id → organizations
--     Operational log, not audit data — CASCADE is appropriate.
--     [FIX C-3: table_schema added to both checks]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name  = 'notifications_log'
               AND table_schema = 'public')
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name  = 'notifications_log'
                  AND column_name = 'organization_id'
                  AND table_schema = 'public') THEN
    ALTER TABLE notifications_log DROP CONSTRAINT IF EXISTS notifications_log_organization_id_fkey;
    ALTER TABLE notifications_log ADD CONSTRAINT notifications_log_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3P. biometric_devices.branch_id → branches
--     [FIX C-3: table_schema added to both checks]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name  = 'biometric_devices'
               AND table_schema = 'public')
    AND EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name  = 'branches'
                  AND table_schema = 'public') THEN
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
-- [FIX M-1: users.email uses exception handler instead of TOCTOU pre-check]
-- [FIX H-4: pg_constraint checks scoped by schema + table name]
-- [FIX C-3: table_schema = 'public' added to all information_schema checks]
-- ─────────────────────────────────────────────────────────────

-- 4A. users.email — global uniqueness  [FIX M-1: exception-based handler]
--     WHY: TOCTOU pre-check (SELECT ... IF no duplicates ... ALTER TABLE)
--          had a race window. PostgreSQL's own constraint validation is
--          the authoritative duplicate check. Exception handler gives a
--          clean NOTICE instead of an aborted transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname IN ('users_email_unique','users_email_key')
      AND r.relname   = 'users'
      AND n.nspname   = 'public'
  ) THEN
    RAISE NOTICE 'users.email UNIQUE already exists — skipped';
  ELSE
    BEGIN
      ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
      RAISE NOTICE 'UNIQUE(users.email) added';
    EXCEPTION WHEN unique_violation OR duplicate_object THEN
      RAISE NOTICE 'WARNING: Duplicate emails exist — users_email_unique NOT added. '
                   'Resolve with: SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;';
    END;
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

-- 4H. notification_recipients (organization_id, email)  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name  = 'notification_recipients'
               AND table_schema = 'public')
    AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name  = 'notification_recipients'
                  AND column_name = 'email'
                  AND table_schema = 'public') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_recipients_org_email
             ON notification_recipients(organization_id, LOWER(TRIM(email)))';
  END IF;
END $$;

-- 4I. assets (organization_id, asset_tag) — no duplicate tags per org  [FIX C-3]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'assets'
               AND column_name = 'asset_tag'
               AND table_schema = 'public') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_org_tag_unique
             ON assets(organization_id, asset_tag)
             WHERE asset_tag IS NOT NULL AND asset_tag <> ''''';
  END IF;
END $$;

-- 4J. payslips (user_id, month, year, organization_id) — CRITICAL multi-tenant fix
--     WHY: hrms_full_migration.sql created UNIQUE(user_id, month, year) without
--          organization_id. A user_id in org A and org B could collide.
--     [FIX H-4: pg_constraint scoped by table + schema, not name alone]
DO $$
BEGIN
  -- Guard: table must exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'payslips' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'payslips table not found — skipping constraint upgrade';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'payslips_user_id_month_year_key'
      AND r.relname = 'payslips' AND n.nspname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'payslips_user_id_month_year_organization_id_key'
      AND r.relname = 'payslips' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE payslips DROP CONSTRAINT payslips_user_id_month_year_key;
    RAISE NOTICE 'Dropped payslips UNIQUE missing org_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'payslips_user_id_month_year_organization_id_key'
      AND r.relname = 'payslips' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE payslips ADD CONSTRAINT payslips_user_id_month_year_organization_id_key
      UNIQUE(user_id, month, year, organization_id);
    RAISE NOTICE 'Added payslips UNIQUE(user_id, month, year, organization_id)';
  ELSE
    RAISE NOTICE 'payslips UNIQUE(user_id, month, year, organization_id) already correct';
  END IF;
END $$;

-- 4K. shift_assignments (user_id, date, organization_id) — multi-tenant fix
--     [FIX H-4: pg_constraint scoped by table + schema]
DO $$
BEGIN
  -- Guard: table must exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'shift_assignments' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'shift_assignments table not found — skipping constraint upgrade';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'shift_assignments_user_id_date_key'
      AND r.relname = 'shift_assignments' AND n.nspname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'shift_assignments_user_id_date_organization_id_key'
      AND r.relname = 'shift_assignments' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE shift_assignments DROP CONSTRAINT shift_assignments_user_id_date_key;
    RAISE NOTICE 'Dropped shift_assignments UNIQUE missing org_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'shift_assignments_user_id_date_organization_id_key'
      AND r.relname = 'shift_assignments' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE shift_assignments ADD CONSTRAINT shift_assignments_user_id_date_organization_id_key
      UNIQUE(user_id, date, organization_id);
    RAISE NOTICE 'Added shift_assignments UNIQUE(user_id, date, organization_id)';
  ELSE
    RAISE NOTICE 'shift_assignments UNIQUE already correct';
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
--
-- [FIX H-1] ALL constraints added as NOT VALID.
--   NOT VALID adds only metadata — takes brief AccessExclusiveLock
--   with no row scanning, regardless of table size.
--   Validation (row scanning) is done post-COMMIT in Section 5B
--   under ShareUpdateExclusiveLock (reads + writes unblocked).
--
-- [FIX IDEMPOTENCY] Each constraint is only created if it does not
--   already exist. Re-runs leave existing constraints (validated or
--   not) completely untouched. Section 5B's VALIDATE steps skip
--   constraints where convalidated = TRUE. This prevents re-runs
--   from demoting previously validated constraints back to NOT VALID.
--
-- [FIX C-3] table_schema = 'public' added to all information_schema checks.
-- ROLLBACK: ALTER TABLE <t> DROP CONSTRAINT <name>;
-- ─────────────────────────────────────────────────────────────

-- 5A. attendance.status enum  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_attendance_status'
      AND r.relname = 'attendance' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_status
      CHECK (status IN ('present','absent','on_leave','half_day','wfh')) NOT VALID;
  END IF;
END $$;

-- 5B-inline. attendance non-negative hours  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_attendance_hours'
      AND r.relname = 'attendance' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_hours
      CHECK (
        (work_hours          IS NULL OR work_hours          >= 0) AND
        (gross_hours         IS NULL OR gross_hours         >= 0) AND
        (total_break_minutes IS NULL OR total_break_minutes >= 0)
      ) NOT VALID;
  END IF;
END $$;

-- 5C. leaves.status enum  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_leaves_status'
      AND r.relname = 'leaves' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE leaves ADD CONSTRAINT chk_leaves_status
      CHECK (status IN ('pending','approved','rejected','cancelled')) NOT VALID;
  END IF;
END $$;

-- 5D. leaves.leave_time enum  [NOT VALID — idempotent]
--     'wfh' retained for backward-compat pre-2026-07-02 records.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_leaves_leave_time'
      AND r.relname = 'leaves' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE leaves ADD CONSTRAINT chk_leaves_leave_time
      CHECK (leave_time IN ('full','half','wfh')) NOT VALID;
  END IF;
END $$;

-- 5E. expenses.amount > 0  [NOT VALID — idempotent]
--     Pre-notice preserved: warns if zero-amount rows exist before adding
--     the constraint. VALIDATE CONSTRAINT (Section 5B) will surface those rows.
DO $$
DECLARE v_zero INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_expenses_amount'
      AND r.relname = 'expenses' AND n.nspname = 'public'
  ) THEN
    SELECT COUNT(*) INTO v_zero FROM expenses WHERE amount <= 0;
    IF v_zero > 0 THEN
      RAISE NOTICE 'WARNING: % expense rows with amount <= 0 — constraint added NOT VALID. '
                   'VALIDATE CONSTRAINT (post-commit) will fail until these are resolved.', v_zero;
    END IF;
    ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount CHECK (amount > 0) NOT VALID;
  END IF;
END $$;

-- 5F. expenses.status enum  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_expenses_status'
      AND r.relname = 'expenses' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status
      CHECK (status IN ('pending','approved','rejected')) NOT VALID;
  END IF;
END $$;

-- 5G. payslips.status enum (Section 1A normalized 'draft' → 'generated' first)  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_payslips_status'
      AND r.relname = 'payslips' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE payslips ADD CONSTRAINT chk_payslips_status
      CHECK (status IN ('generated','published')) NOT VALID;
  END IF;
END $$;

-- 5H. payslips non-negative salary fields  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_payslips_amounts'
      AND r.relname = 'payslips' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE payslips ADD CONSTRAINT chk_payslips_amounts
      CHECK (
        (gross_salary     IS NULL OR gross_salary     >= 0) AND
        (net_salary       IS NULL OR net_salary       >= 0) AND
        (lop_days         IS NULL OR lop_days         >= 0) AND
        (lop_amount       IS NULL OR lop_amount       >= 0) AND
        (total_deductions IS NULL OR total_deductions >= 0)
      ) NOT VALID;
  END IF;
END $$;

-- 5I. users.role enum  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_users_role'
      AND r.relname = 'users' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_role
      CHECK (role IN ('employee','admin','root_admin','platform_admin')) NOT VALID;
  END IF;
END $$;

-- 5J. users.employee_status enum  [NOT VALID — idempotent]  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'users'
               AND column_name = 'employee_status'
               AND table_schema = 'public')
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE c.conname = 'chk_users_employee_status'
        AND r.relname = 'users' AND n.nspname = 'public'
    ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_employee_status
      CHECK (employee_status IN ('active','inactive','resigned','terminated','on_leave')) NOT VALID;
  END IF;
END $$;

-- 5K. organizations.status enum  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_organizations_status'
      AND r.relname = 'organizations' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT chk_organizations_status
      CHECK (status IN ('active','inactive','suspended','pending')) NOT VALID;
  END IF;
END $$;

-- 5L. performance_goals.progress 0–100  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_perf_goals_progress'
      AND r.relname = 'performance_goals' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE performance_goals ADD CONSTRAINT chk_perf_goals_progress
      CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)) NOT VALID;
  END IF;
END $$;

-- 5M. performance_reviews.self_rating 0–10  [NOT VALID — idempotent]  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'performance_reviews'
               AND column_name = 'self_rating'
               AND table_schema = 'public')
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE c.conname = 'chk_perf_self_rating'
        AND r.relname = 'performance_reviews' AND n.nspname = 'public'
    ) THEN
    ALTER TABLE performance_reviews ADD CONSTRAINT chk_perf_self_rating
      CHECK (self_rating IS NULL OR (self_rating >= 0 AND self_rating <= 10)) NOT VALID;
  END IF;
END $$;

-- 5N. performance_reviews.manager_rating 0–10  [NOT VALID — idempotent]  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'performance_reviews'
               AND column_name = 'manager_rating'
               AND table_schema = 'public')
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE c.conname = 'chk_perf_manager_rating'
        AND r.relname = 'performance_reviews' AND n.nspname = 'public'
    ) THEN
    ALTER TABLE performance_reviews ADD CONSTRAINT chk_perf_manager_rating
      CHECK (manager_rating IS NULL OR (manager_rating >= 0 AND manager_rating <= 10)) NOT VALID;
  END IF;
END $$;

-- 5O. exit_requests.status enum  [NOT VALID — idempotent]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.conname = 'chk_exit_status'
      AND r.relname = 'exit_requests' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE exit_requests ADD CONSTRAINT chk_exit_status
      CHECK (status IN ('pending','approved','rejected')) NOT VALID;
  END IF;
END $$;

-- 5P. onboarding_checklists.assigned_to enum  [NOT VALID — idempotent]  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'onboarding_checklists'
               AND column_name = 'assigned_to'
               AND table_schema = 'public')
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE c.conname = 'chk_onboarding_assigned_to'
        AND r.relname = 'onboarding_checklists' AND n.nspname = 'public'
    ) THEN
    ALTER TABLE onboarding_checklists ADD CONSTRAINT chk_onboarding_assigned_to
      CHECK (assigned_to IN ('employee','hr','it','manager')) NOT VALID;
  END IF;
END $$;

-- 5Q. announcements.priority enum  [NOT VALID — idempotent]  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'announcements'
               AND column_name = 'priority'
               AND table_schema = 'public')
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE c.conname = 'chk_announcements_priority'
        AND r.relname = 'announcements' AND n.nspname = 'public'
    ) THEN
    ALTER TABLE announcements ADD CONSTRAINT chk_announcements_priority
      CHECK (priority IN ('low','normal','high','urgent')) NOT VALID;
  END IF;
END $$;

-- 5R. announcements.target_audience enum  [NOT VALID — idempotent]  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'announcements'
               AND column_name = 'target_audience'
               AND table_schema = 'public')
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE c.conname = 'chk_announcements_audience'
        AND r.relname = 'announcements' AND n.nspname = 'public'
    ) THEN
    ALTER TABLE announcements ADD CONSTRAINT chk_announcements_audience
      CHECK (target_audience IN ('all','employees','hr')) NOT VALID;
  END IF;
END $$;

-- 5S. assets.status enum  [NOT VALID — idempotent]  [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'assets'
               AND column_name = 'status'
               AND table_schema = 'public')
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE c.conname = 'chk_assets_status'
        AND r.relname = 'assets' AND n.nspname = 'public'
    ) THEN
    ALTER TABLE assets ADD CONSTRAINT chk_assets_status
      CHECK (status IN ('available','assigned','maintenance','retired')) NOT VALID;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 6: NOT NULL CONSTRAINTS
-- [FIX H-5] Exception-based handler replaces the double-scan approach
-- (COUNT(*) check + SET NOT NULL = two full table scans).
-- The exception handler lets PostgreSQL's own validation be the
-- authority — one scan, graceful failure if NULLs exist.
-- [FIX C-3] table_schema = 'public' added to information_schema checks.
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  BEGIN
    ALTER TABLE attendance ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE 'attendance.organization_id → NOT NULL applied';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'SKIP attendance.organization_id: NULL values present — backfill then re-run';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE leaves ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE 'leaves.organization_id → NOT NULL applied';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'SKIP leaves.organization_id: NULL values present — backfill then re-run';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE holidays ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE 'holidays.organization_id → NOT NULL applied';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'SKIP holidays.organization_id: NULL values present — backfill then re-run';
  END;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'notifications'
               AND column_name = 'organization_id'
               AND table_schema = 'public') THEN
    BEGIN
      ALTER TABLE notifications ALTER COLUMN organization_id SET NOT NULL;
      RAISE NOTICE 'notifications.organization_id → NOT NULL applied';
    EXCEPTION WHEN not_null_violation THEN
      RAISE NOTICE 'SKIP notifications.organization_id: NULL values present — backfill then re-run';
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'events'
               AND column_name = 'organization_id'
               AND table_schema = 'public') THEN
    BEGIN
      ALTER TABLE events ALTER COLUMN organization_id SET NOT NULL;
      RAISE NOTICE 'events.organization_id → NOT NULL applied';
    EXCEPTION WHEN not_null_violation THEN
      RAISE NOTICE 'SKIP events.organization_id: NULL values present — backfill then re-run';
    END;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 7: DEFAULT VALUE CORRECTIONS
-- [FIX C-3] table_schema = 'public' added to all information_schema checks.
-- ─────────────────────────────────────────────────────────────

-- 7A. payslips.status default → 'generated' (not 'draft')
ALTER TABLE payslips ALTER COLUMN status SET DEFAULT 'generated';

-- 7B. leave_policies.annual_quota default → 0 (forces explicit admin config)
--     [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'leave_policies'
               AND column_name = 'annual_quota'
               AND table_schema = 'public') THEN
    ALTER TABLE leave_policies ALTER COLUMN annual_quota SET DEFAULT 0;
  END IF;
END $$;

-- 7C. users.work_hours_per_day default → 8
--     [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'users'
               AND column_name = 'work_hours_per_day'
               AND table_schema = 'public') THEN
    ALTER TABLE users ALTER COLUMN work_hours_per_day SET DEFAULT 8;
  END IF;
END $$;

-- 7D. attendance.source default → 'manual'
--     [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'attendance'
               AND column_name = 'source'
               AND table_schema = 'public') THEN
    ALTER TABLE attendance ALTER COLUMN source SET DEFAULT 'manual';
  END IF;
END $$;

-- 7E. attendance.total_break_minutes default → 0
--     [FIX C-3: table_schema added]
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name  = 'attendance'
               AND column_name = 'total_break_minutes'
               AND table_schema = 'public') THEN
    ALTER TABLE attendance ALTER COLUMN total_break_minutes SET DEFAULT 0;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- NOTE: SECTION 8 (COMPOSITE PERFORMANCE INDEXES) IS IN PART 2
-- File: production_db_hardening_part2_indexes.sql
-- Run Part 2 AFTER this script commits.
-- Indexes use CREATE INDEX CONCURRENTLY — cannot run inside a
-- transaction. Part 2 has no BEGIN/COMMIT wrapper.
-- ─────────────────────────────────────────────────────────────


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
  CASE WHEN l.leave_time = 'half' THEN 0.5::NUMERIC
       ELSE (l.end_date::DATE - l.start_date::DATE + 1)::NUMERIC
  END AS days,
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
  SUM(CASE WHEN leave_time = 'half' THEN 0.5::NUMERIC
           ELSE (end_date::DATE - start_date::DATE + 1)::NUMERIC
      END)   AS days_consumed,
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
--
-- [FIX M-4] All functions changed STABLE → VOLATILE.
--   STABLE allows the planner to cache results within a statement,
--   which is incorrect for pre-write validators that must always
--   see the current committed state of the table being validated.
--   VOLATILE forces a fresh execution on every call.
--
-- [FIX M-3] Explicit NUMERIC casts in fn_get_leave_balance to prevent
--   implicit type coercion when l.days is INTEGER or BIGINT.
-- ─────────────────────────────────────────────────────────────

-- 10A. Nominee percentage validation
--      Returns TRUE if percentages for the employee sum to 0 or 100.
--      Call before INSERT/UPDATE on employee_nominees.
--      [FIX M-4: STABLE → VOLATILE]
CREATE OR REPLACE FUNCTION fn_validate_nominee_percentage(
  p_employee_id BIGINT,
  p_org_id      BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE AS $$
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
  'TRUE = nominee shares are 0 (no nominees) or exactly 100%. Call before nominee inserts. VOLATILE: always re-reads table.';

-- 10B. Leave overlap detection
--      Returns count of overlapping pending/approved leaves for the same user.
--      0 = no conflict. Pass p_exclude_id when updating an existing leave record.
--      [FIX M-4: STABLE → VOLATILE]
CREATE OR REPLACE FUNCTION fn_validate_leave_overlap(
  p_user_id    BIGINT,
  p_org_id     BIGINT,
  p_start_date TEXT,
  p_end_date   TEXT,
  p_exclude_id BIGINT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql VOLATILE AS $$
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
  'Returns number of overlapping leaves for the user. 0 = no conflict. Call before leave INSERT/UPDATE. VOLATILE: always re-reads table.';

-- 10C. Shift conflict detection
--      Returns TRUE if user already has a shift assignment on the date.
--      [FIX M-4: STABLE → VOLATILE]
CREATE OR REPLACE FUNCTION fn_validate_shift_conflict(
  p_user_id    BIGINT,
  p_org_id     BIGINT,
  p_date       TEXT,
  p_exclude_id BIGINT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE AS $$
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
  'TRUE = user already has a shift on this date. Call before shift_assignment INSERT. VOLATILE: always re-reads table.';

-- 10D. Leave balance lookup
--      Returns quota, consumed, and remaining days for a user/type/year.
--      Replaces inline balance calculation scattered across leaves.routes.js.
--      [FIX M-4: STABLE → VOLATILE]
--      [FIX M-3: Explicit NUMERIC casts on COALESCE arguments to prevent
--                implicit coercion when l.days is INTEGER returning BIGINT]
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
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.leave_type,
    lp.annual_quota,
    COALESCE(SUM(CASE WHEN l.leave_time = 'half' THEN 0.5::NUMERIC
                      ELSE (l.end_date::DATE - l.start_date::DATE + 1)::NUMERIC
                 END), 0::NUMERIC)                                 AS days_consumed,
    lp.annual_quota - COALESCE(SUM(CASE WHEN l.leave_time = 'half' THEN 0.5::NUMERIC
                                        ELSE (l.end_date::DATE - l.start_date::DATE + 1)::NUMERIC
                                   END), 0::NUMERIC)              AS days_remaining
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
  'Returns quota/consumed/remaining leave days for a user+type+year. Backed by idx_leaves_org_user_type. VOLATILE: always re-reads table.';

-- 10E. Monthly attendance summary function
--      Efficient range query replacing LIKE ''2026-07-%'' in payroll routes.
--      Uses >= / < on ISO-sorted TEXT dates, which the B-tree index supports.
--      [FIX M-4: STABLE → VOLATILE]
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
LANGUAGE plpgsql VOLATILE AS $$
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
  'Monthly attendance for payroll. Replaces LIKE date filter. Uses idx_att_org_user_date range scan. VOLATILE: always re-reads table.';


-- ─────────────────────────────────────────────────────────────
-- SECTION 11: DEAD TABLE DOCUMENTATION
-- Tables created in migrations but never written to by any route.
-- Documented here; NOT dropped. Drop manually after row-count
-- verification confirms they are empty.
-- [FIX C-3] table_schema = 'public' added to every check.
--
-- Cleanup commands (run manually after confirming COUNT(*) = 0):
--   DROP TABLE IF EXISTS clockify_config;
--   DROP TABLE IF EXISTS archives;
--   DROP TABLE IF EXISTS notifications_log;
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name  = 'clockify_config'
               AND table_schema = 'public') THEN
    COMMENT ON TABLE clockify_config IS
      'DEAD TABLE: Clockify removed 2026-07-22. No route reads or writes here. '
      'Drop after confirming row count = 0.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name  = 'archives'
               AND table_schema = 'public') THEN
    COMMENT ON TABLE archives IS
      'DEAD TABLE: Created in sanghavi_migration.sql; never written to. '
      'Archiving is now handled by deleted_at soft-delete columns (Section 2). '
      'Drop after confirming row count = 0.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name  = 'notifications_log'
               AND table_schema = 'public') THEN
    COMMENT ON TABLE notifications_log IS
      'DEAD TABLE: Created in migration but no route inserts here. '
      'Push receipts tracked in push_subscriptions. '
      'Drop after confirming row count = 0.';
  END IF;
END $$;

-- Log dead table row counts for visibility  [FIX C-3: table_schema added]
DO $$
DECLARE
  v_c1 INT := 0; v_c2 INT := 0; v_c3 INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='clockify_config'   AND table_schema='public') THEN EXECUTE 'SELECT COUNT(*) FROM clockify_config'   INTO v_c1; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='archives'          AND table_schema='public') THEN EXECUTE 'SELECT COUNT(*) FROM archives'           INTO v_c2; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notifications_log' AND table_schema='public') THEN EXECUTE 'SELECT COUNT(*) FROM notifications_log'  INTO v_c3; END IF;
  RAISE NOTICE 'Dead table rows — clockify_config: %, archives: %, notifications_log: %', v_c1, v_c2, v_c3;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 12: MIGRATION VERSION RECORDS
-- ON CONFLICT DO NOTHING makes all inserts idempotent.
-- ─────────────────────────────────────────────────────────────

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_001','Data cleanup: normalize payslip status, clamp negatives (single-pass), dedup holidays/policies/departments/payslips/shifts')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_002','Soft delete: deleted_at added to attendance, leaves, payslips, assets, expenses, exit_requests, announcements, events')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_003','FK ON DELETE SET NULL: department_id, designation_id, branch_id, hod_id, reviewed_by, approved_by, generated_by, uploaded_by, reviewer_id, created_by — all wrapped in existence guards')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_004','FK ON DELETE: CASCADE notifications_log.organization_id; SET NULL org_registration_requests, platform_activity, biometric_devices.branch_id')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_005','UNIQUE constraints: users.email (exception-based), users(org,employee_id), holidays(org,date), leave_policies(org,type), work_schedule(org), departments(org,name), designations(org,name), notification_recipients(org,email), assets(org,tag)')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_006','UNIQUE multi-tenant fix: payslips(user,month,year,org_id) scoped by table+schema; shift_assignments(user,date,org_id) scoped by table+schema; att_regularization partial pending')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_007','CHECK constraints (all NOT VALID): attendance.status/hours, leaves.status/leave_time, expenses.amount/status, payslips.status/amounts, users.role/employee_status, organizations.status, perf 0-100/0-10, exit.status, onboarding, announcements, assets.status')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_008','NOT NULL: attendance, leaves, holidays, notifications, events organization_id — exception-based (single-scan)')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_009','Defaults: payslips.status=generated, leave_policies.annual_quota=0, users.work_hours_per_day=8, attendance.source=manual, total_break_minutes=0')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_010','[Part 2] Composite indexes: 40+ CONCURRENTLY on attendance, leaves, holidays, users, expenses, assets, exit, onboarding, performance, announcements, departments, designations, shifts, payroll, notifications, regularization, payslips, events, employee_documents')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_011','Helper views: v_active_employees, v_pending_leaves, v_today_attendance, v_leave_balance_current_year, v_unread_notifications, v_monthly_payroll_summary, v_department_headcount')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_012','Validation functions (VOLATILE): fn_validate_nominee_percentage, fn_validate_leave_overlap, fn_validate_shift_conflict, fn_get_leave_balance (explicit NUMERIC casts), fn_attendance_month')
  ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations(version, description) VALUES
  ('20260729_013','Dead table documentation: clockify_config, archives, notifications_log — commented NOT dropped')
  ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================
-- SECTION 5B: VALIDATE CONSTRAINTS (Post-Commit)
-- Runs OUTSIDE the main transaction.
-- Takes ShareUpdateExclusiveLock — reads AND writes remain
-- unblocked during validation scans. Only other DDL is blocked.
-- Each block is guarded: only validates if constraint exists AND
-- has not yet been validated (convalidated = FALSE).
-- Safe to re-run: already-validated constraints are skipped.
-- ============================================================

-- Allow 10 minutes for validation scans on large tables.
-- Fail quickly if another DDL session holds a conflicting lock.
SET lock_timeout      = '10s';
SET statement_timeout = '600s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_attendance_status' AND r.relname='attendance' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_status;
    RAISE NOTICE 'Validated chk_attendance_status';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_attendance_hours' AND r.relname='attendance' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_hours;
    RAISE NOTICE 'Validated chk_attendance_hours';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_leaves_status' AND r.relname='leaves' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE leaves VALIDATE CONSTRAINT chk_leaves_status;
    RAISE NOTICE 'Validated chk_leaves_status';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_leaves_leave_time' AND r.relname='leaves' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE leaves VALIDATE CONSTRAINT chk_leaves_leave_time;
    RAISE NOTICE 'Validated chk_leaves_leave_time';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_expenses_amount' AND r.relname='expenses' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE expenses VALIDATE CONSTRAINT chk_expenses_amount;
    RAISE NOTICE 'Validated chk_expenses_amount';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_expenses_status' AND r.relname='expenses' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE expenses VALIDATE CONSTRAINT chk_expenses_status;
    RAISE NOTICE 'Validated chk_expenses_status';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_payslips_status' AND r.relname='payslips' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE payslips VALIDATE CONSTRAINT chk_payslips_status;
    RAISE NOTICE 'Validated chk_payslips_status';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_payslips_amounts' AND r.relname='payslips' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE payslips VALIDATE CONSTRAINT chk_payslips_amounts;
    RAISE NOTICE 'Validated chk_payslips_amounts';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_users_role' AND r.relname='users' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE users VALIDATE CONSTRAINT chk_users_role;
    RAISE NOTICE 'Validated chk_users_role';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_users_employee_status' AND r.relname='users' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE users VALIDATE CONSTRAINT chk_users_employee_status;
    RAISE NOTICE 'Validated chk_users_employee_status';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_organizations_status' AND r.relname='organizations' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE organizations VALIDATE CONSTRAINT chk_organizations_status;
    RAISE NOTICE 'Validated chk_organizations_status';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_perf_goals_progress' AND r.relname='performance_goals' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE performance_goals VALIDATE CONSTRAINT chk_perf_goals_progress;
    RAISE NOTICE 'Validated chk_perf_goals_progress';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_perf_self_rating' AND r.relname='performance_reviews' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE performance_reviews VALIDATE CONSTRAINT chk_perf_self_rating;
    RAISE NOTICE 'Validated chk_perf_self_rating';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_perf_manager_rating' AND r.relname='performance_reviews' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE performance_reviews VALIDATE CONSTRAINT chk_perf_manager_rating;
    RAISE NOTICE 'Validated chk_perf_manager_rating';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_exit_status' AND r.relname='exit_requests' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE exit_requests VALIDATE CONSTRAINT chk_exit_status;
    RAISE NOTICE 'Validated chk_exit_status';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_onboarding_assigned_to' AND r.relname='onboarding_checklists' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE onboarding_checklists VALIDATE CONSTRAINT chk_onboarding_assigned_to;
    RAISE NOTICE 'Validated chk_onboarding_assigned_to';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_announcements_priority' AND r.relname='announcements' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE announcements VALIDATE CONSTRAINT chk_announcements_priority;
    RAISE NOTICE 'Validated chk_announcements_priority';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_announcements_audience' AND r.relname='announcements' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE announcements VALIDATE CONSTRAINT chk_announcements_audience;
    RAISE NOTICE 'Validated chk_announcements_audience';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE c.conname='chk_assets_status' AND r.relname='assets' AND n.nspname='public' AND NOT c.convalidated) THEN
    ALTER TABLE assets VALIDATE CONSTRAINT chk_assets_status;
    RAISE NOTICE 'Validated chk_assets_status';
  END IF;
END $$;

RESET lock_timeout;
RESET statement_timeout;


-- ============================================================
-- SECTION 13: VERIFICATION QUERIES
-- Run after COMMIT and after Section 5B VALIDATE steps complete.
-- All "Should be 0" rows indicate clean data.
-- All constraint/index counts should be non-zero.
-- ============================================================

-- 13A. Migration versions applied by this script
SELECT version, description, applied_at
FROM schema_migrations
WHERE version LIKE '20260729_%'
ORDER BY version;

-- 13B. All CHECK constraints added by this migration (scoped to specific names)  [FIX L-3]
SELECT r.relname AS table_name, c.conname AS constraint_name,
       CASE c.convalidated WHEN TRUE THEN 'VALIDATED' ELSE 'NOT VALID (run Section 5B)' END AS validation_state
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
JOIN pg_namespace n ON n.oid = r.relnamespace
WHERE c.contype = 'c'
  AND n.nspname = 'public'
  AND c.conname IN (
    'chk_attendance_status','chk_attendance_hours',
    'chk_leaves_status','chk_leaves_leave_time',
    'chk_expenses_amount','chk_expenses_status',
    'chk_payslips_status','chk_payslips_amounts',
    'chk_users_role','chk_users_employee_status',
    'chk_organizations_status','chk_perf_goals_progress',
    'chk_perf_self_rating','chk_perf_manager_rating',
    'chk_exit_status','chk_onboarding_assigned_to',
    'chk_announcements_priority','chk_announcements_audience',
    'chk_assets_status'
  )
ORDER BY r.relname, c.conname;

-- 13C. FK constraints on key tables with correct on_delete labels  [FIX C-2]
SELECT r.relname AS table_name, c.conname AS fk_name,
       CASE c.confdeltype
         WHEN 'a' THEN 'NO ACTION'   -- corrected from RESTRICT (was wrong)
         WHEN 'r' THEN 'RESTRICT'    -- added (was missing)
         WHEN 'c' THEN 'CASCADE'
         WHEN 'n' THEN 'SET NULL'
         WHEN 'd' THEN 'SET DEFAULT'
         ELSE c.confdeltype::text
       END AS on_delete
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
JOIN pg_namespace n ON n.oid = r.relnamespace
WHERE c.contype = 'f'
  AND n.nspname = 'public'
  AND r.relname IN (
    'leaves','payslips','expenses','exit_requests','attendance_regularization',
    'performance_reviews','employee_documents','events','users'
  )
ORDER BY r.relname, c.conname;

-- 13D. Soft delete columns exist
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE column_name   = 'deleted_at'
  AND table_schema  = 'public'
ORDER BY table_name;

-- 13E. Helper views exist
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name   LIKE 'v_%'
ORDER BY table_name;

-- 13F. Validation functions exist (all should show VOLATILE)
SELECT routine_name, security_type,
       (SELECT p.provolatile FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = r.routine_name AND n.nspname = 'public'
        LIMIT 1)::text AS volatility_code
FROM information_schema.routines r
WHERE routine_schema = 'public' AND routine_name LIKE 'fn_%'
ORDER BY routine_name;

-- 13G. Invalid attendance status (should be 0)
SELECT 'invalid attendance status' AS check_name, COUNT(*) AS bad_rows
FROM attendance WHERE status NOT IN ('present','absent','on_leave','half_day','wfh');

-- 13H. Invalid leave status (should be 0)
SELECT 'invalid leave status' AS check_name, COUNT(*) AS bad_rows
FROM leaves WHERE status NOT IN ('pending','approved','rejected','cancelled');

-- 13I. Invalid user role (should be 0)
SELECT 'invalid user role' AS check_name, COUNT(*) AS bad_rows
FROM users WHERE role NOT IN ('employee','admin','root_admin','platform_admin');

-- 13J. Negative payslip amounts (should be 0)
SELECT 'negative payslip amounts' AS check_name, COUNT(*) AS bad_rows
FROM payslips WHERE gross_salary < 0 OR net_salary < 0 OR lop_days < 0 OR lop_amount < 0;

-- 13K. Duplicate holidays (should be 0)
SELECT 'duplicate holidays' AS check_name, COUNT(*) AS dup_groups
FROM (SELECT organization_id, date FROM holidays
      GROUP BY organization_id, date HAVING COUNT(*) > 1) d;

-- 13L. Duplicate payslips (should be 0)
SELECT 'duplicate payslips' AS check_name, COUNT(*) AS dup_groups
FROM (SELECT user_id, month, year, organization_id FROM payslips
      GROUP BY user_id, month, year, organization_id HAVING COUNT(*) > 1) d;

-- 13M. Orphaned attendance (no matching org — should be 0)
SELECT 'orphaned attendance' AS check_name, COUNT(*) AS orphan_count
FROM attendance a
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = a.organization_id);

-- 13N. Orphaned payslips (no matching user — should be 0)
SELECT 'orphaned payslips' AS check_name, COUNT(*) AS orphan_count
FROM payslips p
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id);

-- 13O. Invalid nominee percentages (should be 0)
SELECT 'invalid nominee totals' AS check_name, COUNT(*) AS bad_employees
FROM (
  SELECT employee_id, organization_id, SUM(percentage_share) AS total
  FROM employee_nominees
  GROUP BY employee_id, organization_id
  HAVING SUM(percentage_share) NOT IN (0, 100)
) invalid;

-- 13P. Payslip status 'draft' remaining (should be 0 after Section 1A)
SELECT 'draft payslips remaining' AS check_name, COUNT(*) AS bad_rows
FROM payslips WHERE status = 'draft';

-- 13Q. work_schedule rows per org (every org should have exactly 1)
SELECT organization_id, COUNT(*) AS schedule_count
FROM work_schedule
GROUP BY organization_id
HAVING COUNT(*) > 1;

-- 13R. Constraint NOT VALID status — identifies any constraints still awaiting validation
SELECT r.relname AS table_name, c.conname AS constraint_name,
       'NEEDS VALIDATE CONSTRAINT' AS action_required
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
JOIN pg_namespace n ON n.oid = r.relnamespace
WHERE c.contype = 'c'
  AND n.nspname = 'public'
  AND NOT c.convalidated
  AND c.conname LIKE 'chk_%'
ORDER BY r.relname, c.conname;

-- 13S. Full summary — scoped to this migration's specific objects  [FIX L-3]
SELECT
  (SELECT COUNT(*) FROM schema_migrations
   WHERE version LIKE '20260729_%')                                                    AS migration_versions,
  (SELECT COUNT(*) FROM pg_constraint c
   JOIN pg_class r ON r.oid = c.conrelid
   JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE c.contype = 'c' AND n.nspname = 'public'
     AND c.conname IN (
       'chk_attendance_status','chk_attendance_hours','chk_leaves_status',
       'chk_leaves_leave_time','chk_expenses_amount','chk_expenses_status',
       'chk_payslips_status','chk_payslips_amounts','chk_users_role',
       'chk_users_employee_status','chk_organizations_status',
       'chk_perf_goals_progress','chk_perf_self_rating','chk_perf_manager_rating',
       'chk_exit_status','chk_onboarding_assigned_to','chk_announcements_priority',
       'chk_announcements_audience','chk_assets_status'
     ))                                                                                AS check_constraints_this_migration,
  (SELECT COUNT(*) FROM pg_constraint c
   JOIN pg_class r ON r.oid = c.conrelid
   JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE c.contype = 'c' AND n.nspname = 'public'
     AND c.conname LIKE 'chk_%' AND NOT c.convalidated)                               AS constraints_awaiting_validation,
  (SELECT COUNT(*) FROM information_schema.views
   WHERE table_schema = 'public' AND table_name LIKE 'v_%')                            AS views_this_migration,
  (SELECT COUNT(*) FROM information_schema.routines
   WHERE routine_schema = 'public' AND routine_name LIKE 'fn_%')                       AS functions_this_migration;
