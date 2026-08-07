-- Phase 3: Dynamic Multi-Level Leave Approval Workflow Engine
-- Run ONCE on PostgreSQL (self-hosted Hostinger VPS).
-- Fully backward-compatible — existing leave data is NOT touched.

BEGIN;

-- ── 1. Workflow configuration ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_workflows (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  workflow_name   TEXT   NOT NULL DEFAULT 'Default Approval Workflow',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce: only one active workflow per org
CREATE UNIQUE INDEX IF NOT EXISTS uidx_leave_workflows_active_org
  ON leave_workflows(organization_id)
  WHERE active = TRUE;

-- ── 2. Workflow levels ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_workflow_levels (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id    BIGINT  NOT NULL REFERENCES leave_workflows(id) ON DELETE CASCADE,
  level_number   INTEGER NOT NULL,
  role_type      TEXT    NOT NULL,
  role_reference TEXT,       -- user_id (as text) when role_type = 'specific_user'
  level_label    TEXT,       -- human-readable label e.g. "HR Approval"
  is_required    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, level_number),
  CHECK (role_type IN (
    'reporting_manager', 'department_head',
    'hr_admin', 'root_admin', 'specific_user'
  ))
);

-- ── 3. Extend leaves table with workflow tracking columns ──────────────────────
ALTER TABLE leaves
  ADD COLUMN IF NOT EXISTS workflow_id         BIGINT,
  ADD COLUMN IF NOT EXISTS current_level       INTEGER,
  ADD COLUMN IF NOT EXISTS current_approver_id BIGINT;

-- ── 4. Extend leave_approval_log with level tracking ──────────────────────────
ALTER TABLE leave_approval_log
  ADD COLUMN IF NOT EXISTS level INTEGER;

-- ── 5. Update status constraint to allow new status values ────────────────────
-- pending_approval = new workflow-based pending (replaces pending_dept/pending_root)
-- withdrawn        = employee cancelled before any approval
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT constraint_name INTO cname
  FROM information_schema.table_constraints
  WHERE table_name       = 'leaves'
    AND constraint_type  = 'CHECK'
    AND constraint_name  ILIKE '%status%'
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE leaves DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE leaves ADD CONSTRAINT leaves_status_check CHECK (
    status IN (
      'pending',            -- legacy (old leaves without workflow)
      'pending_dept',       -- legacy dept-head stage
      'pending_root',       -- legacy root-admin stage
      'pending_approval',   -- NEW: workflow-engine stage (current_level tracks where)
      'approved',
      'rejected',
      'cancelled',          -- reverted after approval
      'withdrawn'           -- NEW: employee withdrew before approval
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Status constraint update skipped (will handle manually): %', SQLERRM;
END;
$$;

-- ── 6. Performance indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leaves_pending_approval_approver
  ON leaves(organization_id, current_approver_id)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_leaves_pending_approval_level
  ON leaves(organization_id, workflow_id, current_level)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_leave_workflows_org
  ON leave_workflows(organization_id);

COMMIT;
