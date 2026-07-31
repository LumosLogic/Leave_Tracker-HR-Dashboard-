-- Phase D: Offboarding Checklists
-- Mirror of onboarding_checklists — run on server before deploying offboarding routes.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS offboarding_checklists (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  BIGINT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT DEFAULT '',
  due_date         DATE,
  assigned_to      TEXT NOT NULL DEFAULT 'hr'
                   CHECK (assigned_to IN ('employee', 'hr', 'it', 'manager', 'finance')),
  order_index      INTEGER NOT NULL DEFAULT 99,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at     TIMESTAMPTZ,
  completed_by     BIGINT REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offboarding_checklists_user_idx ON offboarding_checklists(user_id);
CREATE INDEX IF NOT EXISTS offboarding_checklists_org_idx  ON offboarding_checklists(organization_id);
