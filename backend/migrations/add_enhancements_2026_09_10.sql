-- ENH Migrations: Performance, Announcements, Notifications, Exit Management
-- Run on: 2026-09-10

-- ── ENH_PERF_001: Goal Attachments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goal_attachments (
  id                   BIGSERIAL PRIMARY KEY,
  goal_id              BIGINT NOT NULL REFERENCES performance_goals(id) ON DELETE CASCADE,
  organization_id      BIGINT NOT NULL,
  uploaded_by          BIGINT REFERENCES users(id),
  file_name            TEXT NOT NULL,
  file_url             TEXT NOT NULL,
  cloudinary_public_id TEXT,
  file_size            BIGINT,
  mime_type            TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE goal_attachments DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goal_attachments_goal_id ON goal_attachments(goal_id);

-- ── ENH_PERF_002: Goal Comments / Manager Feedback ────────────────────────────
CREATE TABLE IF NOT EXISTS goal_comments (
  id              BIGSERIAL PRIMARY KEY,
  goal_id         BIGINT NOT NULL REFERENCES performance_goals(id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL,
  reviewer_id     BIGINT REFERENCES users(id),
  comment         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE goal_comments DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goal_comments_goal_id ON goal_comments(goal_id);

-- ── ENH_PERF_004: Self/Manager Assessments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS goal_assessments (
  id              BIGSERIAL PRIMARY KEY,
  goal_id         BIGINT NOT NULL REFERENCES performance_goals(id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('self', 'manager')),
  text            TEXT DEFAULT '',
  rating          NUMERIC DEFAULT 0,
  assessed_by     BIGINT REFERENCES users(id),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(goal_id, type)
);
ALTER TABLE goal_assessments DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goal_assessments_goal_id ON goal_assessments(goal_id);

-- ── EHN_ANN_002: Scheduled Announcements ──────────────────────────────────────
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;

-- ── EHN_ANN_003: Announcement Read Tracking ───────────────────────────────────
CREATE TABLE IF NOT EXISTS announcement_reads (
  id              BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  organization_id BIGINT,
  UNIQUE(announcement_id, user_id)
);
ALTER TABLE announcement_reads DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_announcement_reads_ann  ON announcement_reads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(user_id);

-- ── EHN_NOT_005: Archive column for notifications ─────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_archived ON notifications(user_id, is_archived);

-- ── EHN_EXIT_MNG_005: Rehire Eligible ─────────────────────────────────────────
ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS rehire_eligible TEXT DEFAULT NULL CHECK (rehire_eligible IN ('yes','no','with_conditions') OR rehire_eligible IS NULL);
ALTER TABLE exit_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;

-- ── EHN_BROAD_004: Broadcast History ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_history (
  id              BIGSERIAL PRIMARY KEY,
  broadcast_type  TEXT NOT NULL,
  subject         TEXT,
  message         TEXT NOT NULL,
  sender_id       BIGINT REFERENCES users(id),
  sender_name     TEXT,
  target_user_id  BIGINT,
  recipient_count INTEGER DEFAULT 0,
  organization_id BIGINT,
  status          TEXT DEFAULT 'sent',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE broadcast_history DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_broadcast_history_org ON broadcast_history(organization_id);

-- ── EHN_LP_001: Leave Policy Audit Log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policy_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  leave_type      TEXT NOT NULL,
  field_changed   TEXT,
  old_value       TEXT,
  new_value       TEXT,
  changed_by      BIGINT REFERENCES users(id),
  changed_by_name TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE leave_policy_audit_log DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lp_audit_org ON leave_policy_audit_log(organization_id);

-- ── EHN_EXIT_MNG_001: Offboarding Checklist Items ────────────────────────────
-- (offboarding table already exists from phase_d_offboarding_checklists.sql)
-- Just ensure exit_requests has the rejection_reason column (already added above)

-- ── ENH_LEAVES_004: Leave Comments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_comments (
  id              BIGSERIAL PRIMARY KEY,
  leave_id        BIGINT NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment         TEXT NOT NULL,
  organization_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE leave_comments DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_leave_comments_leave_id ON leave_comments(leave_id);
