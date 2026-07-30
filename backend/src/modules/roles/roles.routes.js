const express = require('express');
const router  = express.Router();
const { supabase, pool } = require('../../config/db');
const { auth, adminOnly, rootAdminOnly } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');
const { clearUserCache, clearOrgCache } = require('../../services/permissionService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name) {
  return 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
}

// ─── GET /api/roles ───────────────────────────────────────────────────────────
// List all roles for the org with permission count and member count.
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const oId = orgId(req);

    // Roles for this org
    const { data: roles, error } = await supabase
      .from('roles')
      .select('id, name, slug, description, is_system_role, created_at')
      .eq('org_id', oId)
      .order('is_system_role', { ascending: false })
      .order('name');
    if (error) throw error;

    if (!roles?.length) return res.json([]);

    const roleIds = roles.map(r => r.id);

    // Permission counts per role
    const pcRes = await pool.query(
      `SELECT role_id, COUNT(*) AS count
       FROM role_permissions
       WHERE role_id = ANY($1::bigint[])
       GROUP BY role_id`,
      [roleIds]
    );
    const permCounts = {};
    pcRes.rows.forEach(r => { permCounts[r.role_id] = parseInt(r.count); });

    // Member counts per role
    const mcRes = await pool.query(
      `SELECT role_id, COUNT(*) AS count
       FROM user_roles
       WHERE role_id = ANY($1::bigint[]) AND org_id = $2
       GROUP BY role_id`,
      [roleIds, oId]
    );
    const memberCounts = {};
    mcRes.rows.forEach(r => { memberCounts[r.role_id] = parseInt(r.count); });

    res.json(roles.map(r => ({
      ...r,
      permission_count: permCounts[r.id] || 0,
      member_count:     memberCounts[r.id] || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/roles/:id ───────────────────────────────────────────────────────
// Get a single role with its permissions and member list.
router.get('/:id', auth, adminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const roleId = parseInt(req.params.id);

    const { data: role, error } = await supabase
      .from('roles')
      .select('id, name, slug, description, is_system_role, created_at')
      .eq('id', roleId)
      .eq('org_id', oId)
      .maybeSingle();

    if (error) throw error;
    if (!role) return res.status(404).json({ error: 'Role not found' });

    // Get permission IDs for this role
    const { data: rp } = await supabase
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleId);

    const permissionIds = (rp || []).map(r => r.permission_id);

    // Get members
    const { data: members } = await supabase
      .from('user_roles')
      .select('user_id, assigned_at, users!user_roles_user_id_fkey(id, name, email, avatar_color, department, role)')
      .eq('role_id', roleId)
      .eq('org_id', oId);

    res.json({
      ...role,
      permission_ids: permissionIds,
      members: (members || []).map(m => ({
        ...m.users,
        assigned_at: m.assigned_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/roles ──────────────────────────────────────────────────────────
// Create a custom role. Root Admin only.
router.post('/', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId = orgId(req);
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    const trimmedName = name.trim();
    const slug = slugify(trimmedName) + '_' + Date.now();

    const { data, error } = await supabase
      .from('roles')
      .insert({
        org_id:         oId,
        name:           trimmedName,
        slug,
        description:    description || '',
        is_system_role: false,
        created_by:     req.user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: `A role named "${trimmedName}" already exists in this organization` });
      }
      throw error;
    }

    res.json({ ...data, permission_count: 0, member_count: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/roles/:id ───────────────────────────────────────────────────────
// Update name/description of a custom role. Cannot edit system roles' metadata.
router.put('/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const roleId = parseInt(req.params.id);
    const { name, description } = req.body;

    const { data: existing } = await supabase
      .from('roles')
      .select('id, is_system_role')
      .eq('id', roleId)
      .eq('org_id', oId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Role not found' });
    if (existing.is_system_role) {
      return res.status(400).json({ error: 'System roles cannot be renamed. You can adjust their permissions.' });
    }

    const update = {};
    if (name)        update.name        = name.trim();
    if (description !== undefined) update.description = description;

    const { data, error } = await supabase
      .from('roles')
      .update(update)
      .eq('id', roleId)
      .eq('org_id', oId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: `A role named "${name}" already exists` });
      }
      throw error;
    }

    clearOrgCache(oId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/roles/:id ────────────────────────────────────────────────────
// Delete a custom role. System roles cannot be deleted.
// Fails if users are still assigned to this role.
router.delete('/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const roleId = parseInt(req.params.id);

    const { data: role } = await supabase
      .from('roles')
      .select('id, name, is_system_role')
      .eq('id', roleId)
      .eq('org_id', oId)
      .maybeSingle();

    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_system_role) {
      return res.status(400).json({ error: 'System roles cannot be deleted.' });
    }

    // Check for assigned users
    const { count } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', roleId)
      .eq('org_id', oId);

    if (count > 0) {
      return res.status(400).json({
        error: `Cannot delete role "${role.name}" — ${count} user(s) are still assigned to it. Remove them first.`,
        member_count: count,
      });
    }

    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId)
      .eq('org_id', oId);

    if (error) throw error;

    clearOrgCache(oId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/roles/:id/permissions ──────────────────────────────────────────
// Get all permissions assigned to a role.
router.get('/:id/permissions', auth, adminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const roleId = parseInt(req.params.id);

    // Verify role belongs to this org
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .eq('org_id', oId)
      .maybeSingle();

    if (!role) return res.status(404).json({ error: 'Role not found' });

    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission_id, permissions(id, module_key, action, label)')
      .eq('role_id', roleId);

    if (error) throw error;

    const permissions = (data || []).map(r => r.permissions).filter(Boolean);
    res.json(permissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/roles/:id/permissions ──────────────────────────────────────────
// Replace the full permission set for a role.
// Accepts: { permission_ids: [1, 2, 3, ...] }
// Clears existing permissions and re-inserts.
router.put('/:id/permissions', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId          = orgId(req);
    const roleId       = parseInt(req.params.id);
    const { permission_ids } = req.body;

    if (!Array.isArray(permission_ids)) {
      return res.status(400).json({ error: 'permission_ids must be an array' });
    }

    // Verify role belongs to this org
    const { data: role } = await supabase
      .from('roles')
      .select('id, name')
      .eq('id', roleId)
      .eq('org_id', oId)
      .maybeSingle();

    if (!role) return res.status(404).json({ error: 'Role not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete all existing role permissions
      await client.query(
        'DELETE FROM role_permissions WHERE role_id = $1',
        [roleId]
      );

      // Insert new permissions (if any)
      if (permission_ids.length > 0) {
        const values = permission_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [roleId, ...permission_ids]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Invalidate cache for all users who have this role in this org
    clearOrgCache(oId);

    // Return updated permission list
    const { data } = await supabase
      .from('role_permissions')
      .select('permission_id, permissions(id, module_key, action, label)')
      .eq('role_id', roleId);

    res.json((data || []).map(r => r.permissions).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/roles/:id/members ───────────────────────────────────────────────
// Get users assigned to a role.
router.get('/:id/members', auth, adminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const roleId = parseInt(req.params.id);

    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .eq('org_id', oId)
      .maybeSingle();

    if (!role) return res.status(404).json({ error: 'Role not found' });

    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, assigned_at, assigned_by, users!user_roles_user_id_fkey(id, name, email, avatar_color, department, position, role)')
      .eq('role_id', roleId)
      .eq('org_id', oId)
      .order('assigned_at', { ascending: false });

    if (error) throw error;

    res.json((data || []).map(m => ({
      ...m.users,
      assigned_at: m.assigned_at,
      assigned_by: m.assigned_by,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/roles/:id/members ─────────────────────────────────────────────
// Assign a user to a role.
// Body: { user_id: number }
router.post('/:id/members', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const roleId = parseInt(req.params.id);
    const { user_id } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Verify role belongs to org
    const { data: role } = await supabase
      .from('roles')
      .select('id, name')
      .eq('id', roleId)
      .eq('org_id', oId)
      .maybeSingle();

    if (!role) return res.status(404).json({ error: 'Role not found' });

    // Verify user belongs to org
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', user_id)
      .eq('organization_id', oId)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: 'User not found in this organization' });

    const { data, error } = await supabase
      .from('user_roles')
      .insert({ user_id, role_id: roleId, org_id: oId, assigned_by: req.user.id })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: `${user.name} already has the "${role.name}" role` });
      }
      throw error;
    }

    clearUserCache(user_id, oId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/roles/:id/members/:userId ────────────────────────────────────
// Remove a user from a role.
router.delete('/:id/members/:userId', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const roleId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    // Cannot remove yourself from Root Admin role
    if (userId === req.user.id) {
      const { data: role } = await supabase
        .from('roles')
        .select('slug')
        .eq('id', roleId)
        .maybeSingle();
      if (role?.slug === 'root_admin') {
        return res.status(400).json({ error: 'You cannot remove yourself from the Root Admin role.' });
      }
    }

    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('role_id', roleId)
      .eq('user_id', userId)
      .eq('org_id', oId);

    if (error) throw error;

    clearUserCache(userId, oId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/roles/user/:userId ──────────────────────────────────────────────
// Get all roles assigned to a specific user.
router.get('/user/:userId', auth, adminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const userId = parseInt(req.params.userId);

    const { data, error } = await supabase
      .from('user_roles')
      .select('role_id, assigned_at, roles(id, name, slug, is_system_role, description)')
      .eq('user_id', userId)
      .eq('org_id', oId);

    if (error) throw error;

    res.json((data || []).map(r => ({ ...r.roles, assigned_at: r.assigned_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/roles/user/:userId ──────────────────────────────────────────────
// Replace all roles for a user (bulk assign).
// Body: { role_ids: [1, 2, ...] }
router.put('/user/:userId', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const userId = parseInt(req.params.userId);
    const { role_ids } = req.body;

    if (!Array.isArray(role_ids)) {
      return res.status(400).json({ error: 'role_ids must be an array' });
    }

    // Ensure all provided roles belong to this org
    if (role_ids.length > 0) {
      const { count } = await supabase
        .from('roles')
        .select('id', { count: 'exact', head: true })
        .in('id', role_ids)
        .eq('org_id', oId);

      if (count !== role_ids.length) {
        return res.status(400).json({ error: 'One or more roles do not belong to this organization' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing role assignments
      await client.query(
        'DELETE FROM user_roles WHERE user_id = $1 AND org_id = $2',
        [userId, oId]
      );

      // Insert new assignments
      for (const roleId of role_ids) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id, org_id, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, role_id, org_id) DO NOTHING`,
          [userId, roleId, oId, req.user.id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    clearUserCache(userId, oId);

    // Return updated role list
    const { data } = await supabase
      .from('user_roles')
      .select('role_id, assigned_at, roles(id, name, slug, is_system_role, description)')
      .eq('user_id', userId)
      .eq('org_id', oId);

    res.json((data || []).map(r => ({ ...r.roles, assigned_at: r.assigned_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
