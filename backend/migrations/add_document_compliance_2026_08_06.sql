-- Document Compliance & Verification System
-- Run this migration to add employee document requirements functionality
-- Date: 2026-08-06

-- ── Document Requirements (admin-configured checklist) ────────────────────────
CREATE TABLE IF NOT EXISTS document_requirements (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  category              TEXT DEFAULT 'other',
  is_required           BOOLEAN DEFAULT true,
  applicable_to         TEXT DEFAULT 'everyone',
  accepted_formats      TEXT[] DEFAULT ARRAY['pdf','jpg','png'],
  max_file_size_mb      INTEGER DEFAULT 10,
  expiry_required       BOOLEAN DEFAULT false,
  expiry_reminder_days  INTEGER DEFAULT 30,
  verification_required BOOLEAN DEFAULT true,
  allow_reupload        BOOLEAN DEFAULT true,
  display_order         INTEGER DEFAULT 0,
  is_active             BOOLEAN DEFAULT true,
  created_by            BIGINT REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Employee Document Submissions (one active per requirement per user) ────────
CREATE TABLE IF NOT EXISTS employee_doc_submissions (
  id                    BIGSERIAL PRIMARY KEY,
  requirement_id        BIGINT NOT NULL REFERENCES document_requirements(id) ON DELETE CASCADE,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id       BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_url              TEXT NOT NULL,
  file_type             TEXT,
  file_size             INTEGER,
  file_name             TEXT,
  cloudinary_public_id  TEXT,
  status                TEXT DEFAULT 'under_review'
                        CHECK (status IN ('under_review','approved','rejected','re_upload_requested')),
  rejection_reason      TEXT,
  expiry_date           DATE,
  reviewed_by           BIGINT REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  uploaded_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  version               INTEGER DEFAULT 1
);

-- One active submission per requirement per employee
CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_doc_sub_req_user
  ON employee_doc_submissions(requirement_id, user_id);

-- ── Submission Activity Log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_submission_activity (
  id              BIGSERIAL PRIMARY KEY,
  requirement_id  BIGINT REFERENCES document_requirements(id) ON DELETE SET NULL,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  details         TEXT,
  actor_id        BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_doc_req_org_active
  ON document_requirements(organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_emp_doc_sub_user
  ON employee_doc_submissions(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_emp_doc_sub_org_status
  ON employee_doc_submissions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_doc_activity_user
  ON doc_submission_activity(user_id, organization_id, created_at);
