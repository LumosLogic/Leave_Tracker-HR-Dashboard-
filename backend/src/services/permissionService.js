/**
 * permissionService.js
 *
 * Resolves RBAC permissions for a user within an org.
 * Phase 1: DB lookup with in-memory TTL cache.
 * Phase 4: Will be replaced with JWT-embedded permissions.
 *
 * DOES NOT modify auth.js or any existing middleware.
 * Existing adminOnly() checks remain untouched.
 */

const { pool } = require('../config/db');

// ─── In-memory cache ─────────────────────────────────────────────────────────
// key: `${userId}:${orgId}`   value: { permissions: string[], expiresAt: number }
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _cacheKey(userId, orgId) {
  return `${userId}:${orgId}`;
}

function _getCached(userId, orgId) {
  const entry = _cache.get(_cacheKey(userId, orgId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(_cacheKey(userId, orgId));
    return null;
  }
  return entry.permissions;
}

function _setCache(userId, orgId, permissions) {
  _cache.set(_cacheKey(userId, orgId), {
    permissions,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ─── Core: Resolve permissions ────────────────────────────────────────────────

/**
 * Resolves all permissions for a user within an org.
 * Returns array of "module.action" strings, e.g. ['leaves.view', 'payroll.generate'].
 * Cached for 5 minutes. Call clearCache() after role changes.
 */
async function resolvePermissions(userId, orgId) {
  if (!userId || !orgId) return [];

  const cached = _getCached(userId, orgId);
  if (cached) return cached;

  try {
    const result = await pool.query(
      `SELECT DISTINCT
         p.module_key || '.' || p.action AS permission
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p       ON p.id = rp.permission_id
       WHERE ur.user_id = $1
         AND ur.org_id  = $2`,
      [userId, orgId]
    );

    const permissions = result.rows.map(r => r.permission);
    _setCache(userId, orgId, permissions);
    return permissions;
  } catch (err) {
    // If RBAC tables don't exist yet (pre-migration), return empty
    if (err.message && err.message.includes('does not exist')) return [];
    console.error('[permissionService] resolvePermissions error:', err.message);
    return [];
  }
}

// ─── Pure permission check ─────────────────────────────────────────────────────

/**
 * Checks if a permission array includes module.action.
 * Pure function — no DB, no cache.
 */
function hasPermissionCheck(permissions, module, action) {
  return Array.isArray(permissions) && permissions.includes(`${module}.${action}`);
}

// ─── Cache invalidation ────────────────────────────────────────────────────────

/**
 * Clear cached permissions for a specific user+org pair.
 * Call this after assigning or removing roles from a user.
 */
function clearUserCache(userId, orgId) {
  _cache.delete(_cacheKey(userId, orgId));
}

/**
 * Clear ALL cached permissions for an org.
 * Call this after modifying a role's permissions.
 */
function clearOrgCache(orgId) {
  for (const key of _cache.keys()) {
    if (key.endsWith(`:${orgId}`)) _cache.delete(key);
  }
}

// ─── System role seeding for new orgs ─────────────────────────────────────────

/**
 * Seeds system roles and permission mappings for a brand-new organization.
 * Called from platform.routes.js after org approval creates the org + root user.
 *
 * @param {number} orgId       — The new organization's id
 * @param {number} rootUserId  — The root_admin user's id created for this org
 * @param {object} client      — Optional pg transaction client. If null, uses pool.
 */
async function seedSystemRolesForOrg(orgId, rootUserId, client) {
  const db = client || pool;

  // Insert the 4 system roles
  const rolesRes = await db.query(
    `INSERT INTO roles (org_id, name, slug, description, is_system_role)
     VALUES
       ($1, 'Root Admin',       'root_admin', 'Full system access.',              true),
       ($1, 'HR Admin',         'hr_admin',   'HR management access.',            true),
       ($1, 'Department Head',  'dept_head',  'Department-level team access.',     true),
       ($1, 'Employee',         'employee',   'Standard employee self-service.',   true)
     ON CONFLICT (org_id, slug) DO NOTHING
     RETURNING id, slug`,
    [orgId]
  );

  // Build slug → id map from what was actually inserted or already existed
  let slugToId = {};
  rolesRes.rows.forEach(r => { slugToId[r.slug] = r.id; });

  // If some already existed (re-run safety), fetch them
  if (Object.keys(slugToId).length < 4) {
    const existing = await db.query(
      `SELECT id, slug FROM roles WHERE org_id = $1 AND is_system_role = true`,
      [orgId]
    );
    existing.rows.forEach(r => { slugToId[r.slug] = r.id; });
  }

  const rootRoleId = slugToId['root_admin'];
  const hrRoleId   = slugToId['hr_admin'];
  const dhRoleId   = slugToId['dept_head'];
  const empRoleId  = slugToId['employee'];

  // Assign ALL permissions to Root Admin
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id FROM permissions
     ON CONFLICT (role_id, permission_id) DO NOTHING`,
    [rootRoleId]
  );

  // HR Admin permissions
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, p.id FROM permissions p
     WHERE (p.module_key, p.action) IN (
       ('dashboard','view'),('employees','view'),('employees','create'),('employees','edit'),
       ('employees','delete'),('employees','export'),('departments','view'),('departments','create'),
       ('departments','edit'),('departments','delete'),('designations','view'),('designations','manage'),
       ('attendance','view'),('attendance','edit'),('attendance','export'),('attendance','approve_regularization'),
       ('leaves','view'),('leaves','approve'),('leaves','reject'),('leaves','export'),
       ('payroll','view'),('payroll','generate'),('payroll','export'),('payroll','lock'),
       ('payroll','manage_structures'),('payroll','manage_adjustments'),
       ('reports','view'),('reports','export'),('settings','view'),('settings','manage'),
       ('documents','view'),('documents','upload'),('documents','manage'),('documents','delete'),
       ('onboarding','view'),('onboarding','manage'),('onboarding','complete_task'),
       ('announcements','view'),('announcements','create'),('announcements','manage'),
       ('holidays','view'),('holidays','create'),('holidays','manage'),
       ('shifts','view'),('shifts','create'),('shifts','manage'),
       ('biometric','view'),('branches','view'),
       ('assets','view'),('assets','create'),('assets','manage'),('assets','assign'),
       ('expenses','view'),('expenses','approve'),('expenses','manage'),
       ('performance','view'),('performance','create'),('performance','manage'),
       ('exit','view'),('exit','approve'),('exit','manage'),
       ('roles','view'),('notifications','view'),('notifications','broadcast')
     )
     ON CONFLICT (role_id, permission_id) DO NOTHING`,
    [hrRoleId]
  );

  // Department Head permissions
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, p.id FROM permissions p
     WHERE (p.module_key, p.action) IN (
       ('dashboard','view'),('employees','view'),('departments','view'),
       ('attendance','view'),('leaves','view'),('leaves','forward'),
       ('documents','view'),('announcements','view'),('holidays','view'),
       ('onboarding','view'),('performance','view'),('expenses','view'),
       ('reports','view'),('notifications','view')
     )
     ON CONFLICT (role_id, permission_id) DO NOTHING`,
    [dhRoleId]
  );

  // Employee permissions
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, p.id FROM permissions p
     WHERE (p.module_key, p.action) IN (
       ('dashboard','view'),('attendance','view'),
       ('leaves','view'),('leaves','create'),
       ('documents','view'),('documents','upload'),
       ('announcements','view'),('holidays','view'),
       ('expenses','view'),('expenses','create'),
       ('performance','view'),('performance','create'),
       ('onboarding','view'),('onboarding','complete_task'),
       ('notifications','view')
     )
     ON CONFLICT (role_id, permission_id) DO NOTHING`,
    [empRoleId]
  );

  // Assign root_admin role to the new root user
  if (rootUserId && rootRoleId) {
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, org_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role_id, org_id) DO NOTHING`,
      [rootUserId, rootRoleId, orgId]
    );
  }
}

module.exports = {
  resolvePermissions,
  hasPermissionCheck,
  clearUserCache,
  clearOrgCache,
  seedSystemRolesForOrg,
};
