-- Phase C: Backfill user_roles for any users created after Phase 1 RBAC migration
-- but before Phase A-5's auto-assignment fix was deployed.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- Run this on the production server BEFORE deploying Phase C route changes.

INSERT INTO user_roles (user_id, role_id, org_id, assigned_at)
SELECT
  u.id,
  r.id,
  u.organization_id,
  NOW()
FROM users u
JOIN roles r
  ON  r.org_id = u.organization_id
  AND r.slug = CASE u.role
    WHEN 'root_admin' THEN 'root_admin'
    WHEN 'admin'      THEN 'hr_admin'
    WHEN 'employee'   THEN 'employee'
    ELSE NULL
  END
WHERE u.role IN ('root_admin', 'admin', 'employee')
  AND u.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur2
    WHERE ur2.user_id = u.id AND ur2.org_id = u.organization_id
  )
ON CONFLICT (user_id, role_id, org_id) DO NOTHING;

-- Verify: list any users who still have no RBAC role after the above.
-- Should return 0 rows. If not, check that roles table has system roles for all orgs.
SELECT u.id, u.name, u.email, u.role, u.organization_id
FROM users u
WHERE u.role IN ('root_admin', 'admin', 'employee')
  AND u.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.org_id = u.organization_id
  );
