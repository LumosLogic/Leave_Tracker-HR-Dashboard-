-- BUG_064: Grant branches.create and branches.manage to HR Admin role
-- for all existing organizations.
--
-- Run this once after deploying the branches feature.
-- Safe to re-run (uses ON CONFLICT DO NOTHING).

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (p.module_key, p.action) IN (
  ('branches', 'create'),
  ('branches', 'manage')
)
WHERE r.slug = 'hr_admin'
  AND r.is_system_role = true
ON CONFLICT (role_id, permission_id) DO NOTHING;
