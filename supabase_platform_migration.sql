-- ============================================================
-- Platform Admin Migration
-- Run ONCE in Supabase SQL Editor
-- ============================================================

-- 1. Organization registration requests (pending approval queue)
CREATE TABLE IF NOT EXISTS org_registration_requests (
  id            SERIAL PRIMARY KEY,
  company_name  TEXT NOT NULL,
  contact_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  website       TEXT,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewer_notes TEXT,
  ip_address    TEXT,
  -- populated on approval
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL
);

-- 2. Platform admins (super admins above all organizations)
CREATE TABLE IF NOT EXISTS platform_admins (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Platform activity log
CREATE TABLE IF NOT EXISTS platform_activity (
  id          SERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,   -- org_request_submitted | org_approved | org_rejected | org_created
  description TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast pending queries
CREATE INDEX IF NOT EXISTS idx_org_requests_status     ON org_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_org_requests_email      ON org_registration_requests(email);
CREATE INDEX IF NOT EXISTS idx_platform_activity_type  ON platform_activity(event_type);
CREATE INDEX IF NOT EXISTS idx_platform_activity_time  ON platform_activity(created_at DESC);

-- ============================================================
-- Seed the default platform admin
-- IMPORTANT: Change these credentials before going live!
-- Password below is bcrypt hash of "PlatformAdmin@2026"
-- Generate your own: https://bcrypt.online/ (cost 10)
-- ============================================================
INSERT INTO platform_admins (name, email, password)
VALUES (
  'Platform Admin',
  'platform@lumoslogic.com',
  '$2a$10$9d/O1LvCxdbL2JVRPDP31.SdN/x3SRqfFmWPB76nMe6Me84B3kdyi'
)
ON CONFLICT (email) DO NOTHING;
