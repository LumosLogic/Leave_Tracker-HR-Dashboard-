-- ─────────────────────────────────────────────────────────────────────────────
-- Patch: 2026-06-29
-- Adds columns and tables introduced by the AI worker commits today.
-- Run this once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. announcements — attachment support (commit 3aaa5b0)
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS file_url   TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS file_name  TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS file_type  TEXT;

-- 2. users — email verification + account status (commit 3cb7ab6)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified    BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'active';

-- 3. archives — persistent archive store for soft-deleted records (commit 3cb7ab6)
CREATE TABLE IF NOT EXISTS archives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_name      TEXT NOT NULL,
  record          JSONB NOT NULL,
  archived_by     BIGINT REFERENCES users(id),
  archived_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE archives DISABLE ROW LEVEL SECURITY;
