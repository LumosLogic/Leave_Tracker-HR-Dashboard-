-- Migration: Document Management Redesign
-- Run once. All operations are additive and idempotent (IF NOT EXISTS / IF NOT EXISTS).

-- 1. Delete request workflow — persists HR delete requests for Root Admin inbox
CREATE TABLE IF NOT EXISTS document_delete_requests (
  id               SERIAL PRIMARY KEY,
  document_id      INTEGER NOT NULL REFERENCES employee_documents(id) ON DELETE CASCADE,
  requested_by     INTEGER NOT NULL REFERENCES users(id),
  organization_id  INTEGER NOT NULL,
  reason           TEXT    NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
  actioned_by      INTEGER REFERENCES users(id),
  actioned_at      TIMESTAMPTZ,
  actioned_reason  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_del_req_org_status
  ON document_delete_requests(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_doc_del_req_document_id
  ON document_delete_requests(document_id);

-- 2. Per-employee requirement assignment (NULL = visible to all — backward compatible)
ALTER TABLE document_requirements
  ADD COLUMN IF NOT EXISTS assigned_employee_ids INTEGER[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_doc_req_assigned_employees
  ON document_requirements USING GIN (assigned_employee_ids)
  WHERE assigned_employee_ids IS NOT NULL;
