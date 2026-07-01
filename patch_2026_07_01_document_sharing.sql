-- patch_2026_07_01_document_sharing.sql
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query → Paste → Run)

-- 1. Add visibility column to employee_documents
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'self'
    CHECK (visibility IN ('self', 'all', 'specific', 'admin_only'));

-- 2. Create document_shares table (for specific employee sharing)
CREATE TABLE IF NOT EXISTS document_shares (
  id                   BIGSERIAL PRIMARY KEY,
  document_id          BIGINT NOT NULL REFERENCES employee_documents(id) ON DELETE CASCADE,
  shared_with_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, shared_with_user_id)
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_doc_shares_doc_id
  ON document_shares(document_id);

CREATE INDEX IF NOT EXISTS idx_doc_shares_user_org
  ON document_shares(shared_with_user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_emp_docs_visibility
  ON employee_documents(organization_id, visibility);
