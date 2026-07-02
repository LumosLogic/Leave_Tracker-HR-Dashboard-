-- Multi-department support: junction table for user ↔ department assignments
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS user_departments (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  department_id   INTEGER NOT NULL,
  role_in_dept    VARCHAR(100) NOT NULL DEFAULT 'Member',
  organization_id INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, department_id),
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- Enable Row Level Security (matches your other tables)
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups by user or department
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id   ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept_id   ON user_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_org_id    ON user_departments(organization_id);

-- Backfill: for every existing employee who has a non-empty department string,
-- try to create a user_departments record linking them to the matching department row.
-- Rows that don't find a matching departments.name are silently skipped.
INSERT INTO user_departments (user_id, department_id, role_in_dept, organization_id)
SELECT
  u.id,
  d.id,
  'Member',
  u.organization_id
FROM users u
JOIN departments d
  ON d.name = u.department
  AND d.organization_id = u.organization_id
WHERE u.role = 'employee'
  AND u.department IS NOT NULL
  AND u.department <> ''
ON CONFLICT (user_id, department_id) DO NOTHING;

-- Also backfill department heads: if the departments.head_user_id is set,
-- make sure that user has a record in user_departments for that department.
INSERT INTO user_departments (user_id, department_id, role_in_dept, organization_id)
SELECT
  d.head_user_id,
  d.id,
  'Head',
  d.organization_id
FROM departments d
WHERE d.head_user_id IS NOT NULL
ON CONFLICT (user_id, department_id)
  DO UPDATE SET role_in_dept = 'Head';
