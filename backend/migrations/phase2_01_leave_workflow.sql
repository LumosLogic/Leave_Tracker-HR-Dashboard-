-- ============================================================
-- PHASE 2: DEPARTMENT HEAD LEAVE APPROVAL WORKFLOW
-- Date: 2026-07-30
--
-- SAFE TO RE-RUN: All statements are idempotent.
-- ADDITIVE ONLY: No existing data removed or column dropped.
-- BACKWARD COMPAT: existing 'pending' status rows unchanged.
--
-- New leave status flow:
--   pending_dept  → waiting for Department Head
--   pending_root  → waiting for Root Admin (final decision)
--   approved      → Root Admin approved
--   rejected      → Root Admin rejected
--   cancelled     → Employee cancelled
--   pending       → kept for backward compat (old leaves)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- SECTION 0: GUARD — schema_migrations must exist
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  description TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by  TEXT        NOT NULL DEFAULT current_user
);

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: UPDATE leaves.status CHECK CONSTRAINT
-- Drop old constraint (4 values) and add new one (6 values).
-- Existing rows with status IN old set are all valid in new set.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE leaves DROP CONSTRAINT IF EXISTS chk_leaves_status;
ALTER TABLE leaves ADD CONSTRAINT chk_leaves_status
  CHECK (status IN ('pending','pending_dept','pending_root','approved','rejected','cancelled'));

-- ─────────────────────────────────────────────────────────────
-- SECTION 2: ADD DEPT HEAD COLUMNS TO leaves
-- ─────────────────────────────────────────────────────────────

ALTER TABLE leaves
  ADD COLUMN IF NOT EXISTS dept_head_status       TEXT        DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS dept_head_id           BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dept_head_reviewed_at  TIMESTAMPTZ;

-- CHECK constraint for dept_head_status (idempotent via exception handler)
DO $$ BEGIN
  ALTER TABLE leaves ADD CONSTRAINT chk_leaves_dept_head_status
    CHECK (dept_head_status IN ('pending','approved'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 3: ADD ROOT ADMIN COLUMNS TO leaves
-- ─────────────────────────────────────────────────────────────

ALTER TABLE leaves
  ADD COLUMN IF NOT EXISTS root_admin_status       TEXT        DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS root_admin_id           BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_admin_reviewed_at  TIMESTAMPTZ;

-- CHECK constraint for root_admin_status
DO $$ BEGIN
  ALTER TABLE leaves ADD CONSTRAINT chk_leaves_root_admin_status
    CHECK (root_admin_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 4: leave_approval_log — immutable audit trail
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_approval_log (
  id          BIGSERIAL PRIMARY KEY,
  leave_id    BIGINT NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT,
  action      TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE leave_approval_log ADD CONSTRAINT chk_lal_action
    CHECK (action IN ('submitted','dept_approved','root_approved','root_rejected','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_lal_leave_id  ON leave_approval_log(leave_id);
CREATE INDEX IF NOT EXISTS idx_lal_org_date  ON leave_approval_log(org_id, created_at DESC);

ALTER TABLE leave_approval_log DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- SECTION 5: INDEXES for new query patterns
-- ─────────────────────────────────────────────────────────────

-- Dept head queries: "show me pending_dept leaves from my department employees"
CREATE INDEX IF NOT EXISTS idx_leaves_pending_dept
  ON leaves(organization_id, user_id, created_at DESC)
  WHERE status = 'pending_dept' AND deleted_at IS NULL;

-- Root admin queries: "show me leaves pending my final decision"
CREATE INDEX IF NOT EXISTS idx_leaves_pending_root
  ON leaves(organization_id, created_at DESC)
  WHERE status = 'pending_root' AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- SECTION 6: BACKFILL EXISTING DATA
-- Old leaves with status='pending' remain as 'pending'.
-- They continue to work via the existing PUT /:id/approve route.
-- No changes needed — the new CHECK constraint includes 'pending'.
-- dept_head_status / root_admin_status default to 'pending' for
-- all existing rows (set by DEFAULT at column add time above).
-- ─────────────────────────────────────────────────────────────

-- Verify no constraint violations on existing data
DO $$
DECLARE v_bad INT;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM leaves
  WHERE status NOT IN ('pending','pending_dept','pending_root','approved','rejected','cancelled');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORT: % leave rows have invalid status values', v_bad;
  END IF;
  RAISE NOTICE 'leave status values OK — no constraint violations';
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 7: MIGRATION VERSIONS
-- ─────────────────────────────────────────────────────────────

INSERT INTO schema_migrations(version, description) VALUES
  ('20260730_phase2_001', 'Updated leaves.status CHECK to include pending_dept, pending_root'),
  ('20260730_phase2_002', 'Added dept_head_status, dept_head_id, dept_head_reviewed_at to leaves'),
  ('20260730_phase2_003', 'Added root_admin_status, root_admin_id, root_admin_reviewed_at to leaves'),
  ('20260730_phase2_004', 'Created leave_approval_log table with audit indexes'),
  ('20260730_phase2_005', 'Added partial indexes for pending_dept and pending_root queries')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- VERIFICATION (runs outside transaction)
-- ─────────────────────────────────────────────────────────────

-- Confirm new columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'leaves'
  AND column_name IN ('dept_head_status','dept_head_id','dept_head_reviewed_at',
                      'root_admin_status','root_admin_id','root_admin_reviewed_at')
ORDER BY column_name;

-- Confirm leave_approval_log was created
SELECT COUNT(*) AS log_rows FROM leave_approval_log;

-- Confirm CHECK constraints
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN ('chk_leaves_status','chk_leaves_dept_head_status','chk_leaves_root_admin_status','chk_lal_action');

-- Migration versions applied
SELECT version, description FROM schema_migrations WHERE version LIKE '20260730_phase2_%' ORDER BY version;
