-- Expense Manager Approval — M-8
-- Adds two-level approval: employee → reporting manager → HR.
-- If an employee has no reporting_to set, the single-level HR flow is preserved exactly.
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS manager_id          BIGINT REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS manager_notes       TEXT DEFAULT '';

-- Index for the manager-queue query (GET /expenses for a manager user)
CREATE INDEX IF NOT EXISTS idx_expenses_manager_id ON expenses (manager_id, status);

INSERT INTO schema_migrations(version, description)
VALUES ('20260731_expense_manager_approval', 'M-8: add manager_id, manager_approved_at, manager_notes to expenses')
ON CONFLICT (version) DO NOTHING;

COMMIT;
