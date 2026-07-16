-- ─────────────────────────────────────────────────────────────────────────────
-- Patch: 2026-06-30
-- Adds document verification status + bank_details / employment categories
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Document verification status (pending_review | verified | rejected)
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review';

-- 2. Optional: index for fast status filtering
CREATE INDEX IF NOT EXISTS idx_emp_docs_status
  ON employee_documents(organization_id, status);
