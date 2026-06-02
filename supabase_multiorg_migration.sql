-- ============================================================
-- Multi-Tenant Migration: Add Organization support
-- Run this ONCE in Supabase -> SQL Editor -> New query
-- Migrates ALL existing data to the "LumosLogic" organization
-- and prepares the system to serve multiple organizations.
-- ============================================================

-- STEP 1: Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id                     BIGSERIAL PRIMARY KEY,
  name                   TEXT NOT NULL,
  slug                   TEXT UNIQUE NOT NULL,
  domain                 TEXT DEFAULT '',
  logo_url               TEXT DEFAULT '',
  smtp_host              TEXT DEFAULT '',
  smtp_port              INTEGER DEFAULT 587,
  smtp_user              TEXT DEFAULT '',
  smtp_pass              TEXT DEFAULT '',
  smtp_from              TEXT DEFAULT '',
  google_client_id       TEXT DEFAULT '',
  google_client_secret   TEXT DEFAULT '',
  google_refresh_token   TEXT DEFAULT '',
  google_calendar_id     TEXT DEFAULT '',
  clockify_api_key       TEXT DEFAULT '',
  clockify_workspace_id  TEXT DEFAULT '',
  clockify_last_synced   TIMESTAMPTZ,
  vapid_public_key       TEXT DEFAULT '',
  vapid_private_key      TEXT DEFAULT '',
  total_annual_leaves    INTEGER DEFAULT 18,
  plan                   TEXT DEFAULT 'pro',
  status                 TEXT DEFAULT 'active',
  created_at             TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- STEP 2: Insert LumosLogic as organization id=1
INSERT INTO organizations (id, name, slug, domain, plan, status)
VALUES (1, 'LumosLogic', 'lumoslogic', 'lumoslogic.com', 'pro', 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

SELECT setval('organizations_id_seq', GREATEST((SELECT MAX(id) FROM organizations), 1));

-- STEP 3: Migrate Clockify config from clockify_config table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clockify_config') THEN
    UPDATE organizations o
    SET
      clockify_api_key      = COALESCE(cc.api_key, ''),
      clockify_workspace_id = COALESCE(cc.workspace_id, '')
    FROM (SELECT api_key, workspace_id FROM clockify_config LIMIT 1) cc
    WHERE o.id = 1;
  END IF;
END $$;

-- STEP 4: Add organization_id column to core tables
ALTER TABLE users         ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE attendance    ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE leaves        ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE holidays      ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE events        ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;

-- STEP 5: Migrate all existing data to LumosLogic (id=1)
UPDATE users         SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE attendance    SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE leaves        SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE holidays      SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE events        SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE work_schedule SET organization_id = 1 WHERE organization_id IS NULL;

-- STEP 6: Make organization_id NOT NULL with default 1
ALTER TABLE users         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE users         ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE attendance    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE attendance    ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE leaves        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE leaves        ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE holidays      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE holidays      ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE events        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE events        ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE work_schedule ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE work_schedule ALTER COLUMN organization_id SET DEFAULT 1;

-- STEP 7: Update attendance unique constraint to be org-scoped
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_user_id_date_key;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_user_id_date_org_key;
ALTER TABLE attendance ADD CONSTRAINT attendance_user_id_date_org_key
  UNIQUE (user_id, date, organization_id);

-- STEP 8: Add missing columns from earlier pending migrations
ALTER TABLE users    ADD COLUMN IF NOT EXISTS date_of_birth        TEXT;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS clockify_user_id     TEXT;
ALTER TABLE leaves   ADD COLUMN IF NOT EXISTS google_event_id      TEXT;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS google_event_id      TEXT;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS specific_msg         TEXT;
ALTER TABLE events   ADD COLUMN IF NOT EXISTS google_event_id      TEXT;

-- STEP 9: push_subscriptions
-- Use CREATE TABLE IF NOT EXISTS for new installs, then ADD COLUMN IF NOT EXISTS
-- so existing tables (without organization_id) also get the column.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id      BIGINT REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT,
  subscription JSONB,
  user_agent   TEXT,
  PRIMARY KEY (user_id)
);
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY;
UPDATE push_subscriptions SET organization_id = 1 WHERE organization_id IS NULL;

-- STEP 10: notification_recipients
CREATE TABLE IF NOT EXISTS notification_recipients (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT DEFAULT '',
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notification_recipients
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE notification_recipients DISABLE ROW LEVEL SECURITY;
UPDATE notification_recipients SET organization_id = 1 WHERE organization_id IS NULL;

-- STEP 11: notifications_log
CREATE TABLE IF NOT EXISTS notifications_log (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT,
  body           TEXT,
  url            TEXT,
  target_user_id BIGINT REFERENCES users(id),
  sent_by        BIGINT REFERENCES users(id),
  sent_count     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications_log
  ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 1;
ALTER TABLE notifications_log DISABLE ROW LEVEL SECURITY;

-- STEP 12: Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_org         ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_attendance_org    ON attendance(organization_id);
CREATE INDEX IF NOT EXISTS idx_leaves_org        ON leaves(organization_id);
CREATE INDEX IF NOT EXISTS idx_holidays_org      ON holidays(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_org        ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_schedule_org ON work_schedule(organization_id);

-- STEP 13: Disable RLS on all tables
ALTER TABLE users                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance              DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaves                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_schedule           DISABLE ROW LEVEL SECURITY;
ALTER TABLE holidays                DISABLE ROW LEVEL SECURITY;
ALTER TABLE events                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations           DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log       DISABLE ROW LEVEL SECURITY;

-- DONE
-- All existing LumosLogic data is now under organization_id = 1.
-- New organizations registered via /register will get their own id.
-- ============================================================
