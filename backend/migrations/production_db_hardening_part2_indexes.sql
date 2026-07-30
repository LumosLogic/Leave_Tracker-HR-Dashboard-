-- ============================================================
-- PRODUCTION DATABASE HARDENING — PART 2 (INDEX CREATION)
-- HRMS System — Lumos Logic
-- Date: 2026-07-29
-- Revised: 2026-07-29 (post DBA review — all Phase 1/2/3 fixes applied)
--
-- THIS IS PART 2 OF 2.
-- Part 1 MUST be run and committed successfully before this script.
-- File: production_db_hardening_part1.sql
--
-- ============================================================
-- WHY THIS FILE IS SEPARATE  [FIX B-1]
-- ============================================================
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- PostgreSQL raises: "ERROR: CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block" if attempted within BEGIN/COMMIT.
--
-- CREATE INDEX (without CONCURRENTLY) acquires a ShareLock that
-- blocks all writes (INSERT/UPDATE/DELETE) for the duration of
-- the entire index build. For a table with millions of rows this
-- can be many minutes of write downtime.
--
-- CREATE INDEX CONCURRENTLY builds the index in multiple passes,
-- taking only brief locks at the start and end. Reads and writes
-- continue normally throughout the build. This is the only safe
-- way to build indexes on a live production system.
--
-- ============================================================
-- HOW TO RUN (Production)
-- ============================================================
-- Step 1: psql -U lumos_admin -d lumos_hrms \
--           -f backend/migrations/production_db_hardening_part1.sql
--
-- Step 2 (this file — after Part 1 commits):
--         psql -U lumos_admin -d lumos_hrms \
--           -f backend/migrations/production_db_hardening_part2_indexes.sql
--
-- Each CREATE INDEX CONCURRENTLY runs independently.
-- If any index fails mid-build, it is left as INVALID.
-- Check for invalid indexes after running:
--   SELECT schemaname, tablename, indexname
--   FROM pg_indexes
--   WHERE indexname LIKE 'idx_%'
--   INTERSECT
--   SELECT n.nspname, c.relname, i.relname
--   FROM pg_index x
--   JOIN pg_class c ON c.oid = x.indrelid
--   JOIN pg_class i ON i.oid = x.indexrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE NOT x.indisvalid;
--
-- Drop any INVALID index with: DROP INDEX CONCURRENTLY <name>;
-- Then re-run this file — all indexes use IF NOT EXISTS.
--
-- ============================================================
-- IDEMPOTENCY
-- ============================================================
-- All indexes use: CREATE INDEX CONCURRENTLY IF NOT EXISTS
-- Safe to re-run. Existing valid indexes are skipped.
--
-- ============================================================
-- DBA REVIEW FIXES IN THIS FILE
-- ============================================================
-- B-1  All indexes use CREATE INDEX CONCURRENTLY (no transaction)
-- H-3  text_pattern_ops indexes changed from single-column to
--      composite (organization_id, date text_pattern_ops) so that
--      LIKE '2026-07-%' queries with an org_id filter use the index.
--      A single-column text_pattern_ops index is ignored by the
--      planner when the query also filters on organization_id.
-- M-2  Prerequisite guard: verifies Part 1 ran and deleted_at
--      columns exist before creating partial indexes that depend
--      on them (announcements.deleted_at).
-- C-3  information_schema check in events guard includes
--      AND table_schema = 'public'.
-- ============================================================

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────
-- PREREQUISITE CHECK  [FIX M-2]
-- Verify Part 1 was applied before building indexes.
-- Partial indexes below reference deleted_at columns (added in
-- Part 1 Section 2). Building them without the column fails.
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Verify schema_migrations table exists (created by Part 1 Section 0)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name   = 'schema_migrations'
      AND table_schema = 'public'
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: schema_migrations table not found. '
      'Run production_db_hardening_part1.sql first.';
  END IF;

  -- Verify Part 1 section 0 version record exists
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '20260729_001'
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: Migration version 20260729_001 not found in schema_migrations. '
      'Run production_db_hardening_part1.sql first and ensure it committed successfully.';
  END IF;

  -- Verify announcements.deleted_at exists (needed by idx_ann_org_pinned_date partial index)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name   = 'announcements'
      AND column_name  = 'deleted_at'
      AND table_schema = 'public'
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: announcements.deleted_at column missing. '
      'Run production_db_hardening_part1.sql (Section 2) first.';
  END IF;

  -- Verify attendance.deleted_at exists (needed by idx_att_org_user_date partial filter queries)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name   = 'attendance'
      AND column_name  = 'deleted_at'
      AND table_schema = 'public'
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE FAILED: attendance.deleted_at column missing. '
      'Run production_db_hardening_part1.sql (Section 2) first.';
  END IF;

  RAISE NOTICE 'Prerequisites verified. Proceeding with concurrent index creation.';
  RAISE NOTICE 'NOTE: Each CREATE INDEX CONCURRENTLY runs independently. '
               'Monitor pg_stat_activity for progress on large tables.';
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 8: COMPOSITE PERFORMANCE INDEXES
-- Ordered by query criticality (highest volume first).
-- All indexes: CREATE INDEX CONCURRENTLY IF NOT EXISTS
--
-- MONITORING PROGRESS (run in a separate session while this runs):
--   SELECT phase, blocks_done, blocks_total,
--          ROUND(blocks_done::numeric/NULLIF(blocks_total,0)*100,1) AS pct
--   FROM pg_stat_progress_create_index;
--
-- Each index below acquires locks in this sequence:
--   1. ShareUpdateExclusiveLock (brief, at start — allows reads + writes)
--   2. First pass: scans table, builds initial index (reads/writes unblocked)
--   3. ShareLock (brief, to catch up with changes since first pass)
--   4. Second pass: updates index with changes (reads/writes unblocked)
--   5. AccessShareLock (brief, to mark index valid)
-- Total write-blocking time per index: milliseconds, not minutes.
-- ─────────────────────────────────────────────────────────────

-- ── ATTENDANCE — most queried table in the entire system ──────
-- Every dashboard load, check-in, checkout, payroll run, and
-- biometric sync queries this table. Without these indexes,
-- every query is a full sequential scan of 36M+ rows at 100k employees.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_org_date
  ON attendance(organization_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_org_user_date
  ON attendance(organization_id, user_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_org_status_date
  ON attendance(organization_id, status, date);

-- Composite text_pattern_ops index for LIKE '2026-07-%' queries  [FIX H-3]
-- WHY: date is TEXT not DATE. LIKE prefix scans require text_pattern_ops
--      operator class on the date column. A single-column index on just
--      date text_pattern_ops is ignored when the query also filters on
--      organization_id. This composite version enables the planner to
--      use an index scan for: WHERE organization_id=$1 AND date LIKE '2026-07-%'
-- FUTURE: drop this index after migrating date column to DATE type and
--         switching app queries to >= '2026-07-01' AND < '2026-08-01' range.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_org_date_pattern
  ON attendance(organization_id, date text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_wfh_partial
  ON attendance(organization_id, date)
  WHERE status = 'wfh';

-- ── LEAVES ────────────────────────────────────────────────────
-- Leave balance runs on every leave application: user + org + status + date.
-- Without these: every balance calc = full scan of leaves table.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaves_org_user_status
  ON leaves(organization_id, user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaves_org_status_created
  ON leaves(organization_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaves_org_dates
  ON leaves(organization_id, start_date, end_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaves_org_user_type
  ON leaves(organization_id, user_id, leave_type, start_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaves_pending_partial
  ON leaves(organization_id, created_at DESC)
  WHERE status = 'pending';

-- ── NOTIFICATIONS ─────────────────────────────────────────────
-- Unread count is polled on every page load per user.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_org_user_read
  ON notifications(organization_id, user_id, is_read, created_at DESC);

-- ── HOLIDAYS ──────────────────────────────────────────────────
-- Called on every leave balance calculation for holiday exclusion.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_holidays_org_date
  ON holidays(organization_id, date);

-- Composite text_pattern_ops for org-scoped LIKE date queries  [FIX H-3]
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_holidays_org_date_pattern
  ON holidays(organization_id, date text_pattern_ops);

-- ── USERS ─────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org_role
  ON users(organization_id, role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org_active_partial
  ON users(organization_id, name, employee_id)
  WHERE employee_status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org_dept
  ON users(organization_id, department_id)
  WHERE department_id IS NOT NULL;

-- ── EXPENSES ──────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_org_status_created
  ON expenses(organization_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_org_user
  ON expenses(organization_id, user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_pending_partial
  ON expenses(organization_id, created_at DESC)
  WHERE status = 'pending';

-- ── ASSETS ────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_org_status
  ON assets(organization_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_org_assigned
  ON assets(organization_id, assigned_to)
  WHERE assigned_to IS NOT NULL;

-- ── EXIT REQUESTS ─────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exit_org_status
  ON exit_requests(organization_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exit_org_user
  ON exit_requests(organization_id, user_id);

-- ── ONBOARDING ────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_org_user
  ON onboarding_checklists(organization_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_user_completed
  ON onboarding_checklists(user_id, completed);

-- ── PERFORMANCE ───────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_perf_goals_org_user
  ON performance_goals(organization_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_perf_reviews_org_user
  ON performance_reviews(organization_id, user_id);

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────
-- Pinned announcements appear first, then by date.
-- Partial index on deleted_at IS NULL — requires Part 1 Section 2.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ann_org_pinned_date
  ON announcements(organization_id, pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── DEPARTMENTS / DESIGNATIONS ────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dept_org
  ON departments(organization_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_desig_org
  ON designations(organization_id);

-- ── SHIFT ASSIGNMENTS ─────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_assign_org_date
  ON shift_assignments(organization_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shift_assign_org_user_date
  ON shift_assignments(organization_id, user_id, date);

-- ── PAYROLL STRUCTURES ────────────────────────────────────────
-- effective_from DESC: payroll run fetches the most recent structure.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_struct_user_org_eff
  ON payroll_structures(user_id, organization_id, effective_from DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_struct_org
  ON payroll_structures(organization_id);

-- ── ATTENDANCE REGULARIZATION ─────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_reg_org_status_created
  ON attendance_regularization(organization_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_reg_org_user
  ON attendance_regularization(organization_id, user_id);

-- ── LEAVE POLICIES ────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_policies_org_active
  ON leave_policies(organization_id, active);

-- ── PAYSLIPS ──────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payslips_org_period
  ON payslips(organization_id, year DESC, month DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payslips_user_period
  ON payslips(user_id, year DESC, month DESC);

-- ── EMPLOYEE DOCUMENTS ────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emp_docs_org_employee
  ON employee_documents(organization_id, user_id);

-- ── EVENTS ────────────────────────────────────────────────────
-- Conditional: only if events table has a start_date column.
-- [FIX C-3: table_schema = 'public' added]
-- [FIX: CREATE INDEX CONCURRENTLY cannot run inside DO $$ (implicit transaction).
--  Uses psql \gset + \if metacommands — executes outside any transaction block.]

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name   = 'events'
    AND column_name  = 'start_date'
    AND table_schema = 'public'
) AS events_has_start_date \gset

\if :events_has_start_date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_org_date
  ON events(organization_id, start_date);
\else
SELECT 'NOTICE: events.start_date not found — idx_events_org_date skipped' AS migration_notice;
\endif


-- ─────────────────────────────────────────────────────────────
-- POST-INDEX VERIFICATION
-- Run after all indexes are created to confirm success and
-- identify any that failed (left in INVALID state).
-- ─────────────────────────────────────────────────────────────

-- Check all indexes created by this migration
SELECT tablename, indexname,
       CASE WHEN x.indisvalid THEN 'VALID' ELSE 'INVALID — drop and rebuild' END AS index_state
FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_index  x  ON x.indexrelid = ic.oid
WHERE pi.indexname IN (
  'idx_att_org_date','idx_att_org_user_date','idx_att_org_status_date',
  'idx_att_org_date_pattern','idx_att_wfh_partial',
  'idx_leaves_org_user_status','idx_leaves_org_status_created',
  'idx_leaves_org_dates','idx_leaves_org_user_type','idx_leaves_pending_partial',
  'idx_notif_org_user_read',
  'idx_holidays_org_date','idx_holidays_org_date_pattern',
  'idx_users_org_role','idx_users_org_active_partial','idx_users_org_dept',
  'idx_expenses_org_status_created','idx_expenses_org_user','idx_expenses_pending_partial',
  'idx_assets_org_status','idx_assets_org_assigned',
  'idx_exit_org_status','idx_exit_org_user',
  'idx_onboarding_org_user','idx_onboarding_user_completed',
  'idx_perf_goals_org_user','idx_perf_reviews_org_user',
  'idx_ann_org_pinned_date',
  'idx_dept_org','idx_desig_org',
  'idx_shift_assign_org_date','idx_shift_assign_org_user_date',
  'idx_payroll_struct_user_org_eff','idx_payroll_struct_org',
  'idx_att_reg_org_status_created','idx_att_reg_org_user',
  'idx_leave_policies_org_active',
  'idx_payslips_org_period','idx_payslips_user_period',
  'idx_emp_docs_org_employee',
  'idx_events_org_date'
)
ORDER BY
  CASE WHEN x.indisvalid THEN 1 ELSE 0 END,  -- INVALID first
  pi.tablename, pi.indexname;

-- Summary counts
SELECT
  COUNT(*) FILTER (WHERE x.indisvalid)     AS valid_indexes,
  COUNT(*) FILTER (WHERE NOT x.indisvalid) AS invalid_indexes_require_rebuild
FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_index  x  ON x.indexrelid = ic.oid
WHERE pi.indexname LIKE 'idx_%'
  AND pi.schemaname = 'public';
