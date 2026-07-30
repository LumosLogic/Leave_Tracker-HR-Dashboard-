const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');

// ─── GET /api/permissions ─────────────────────────────────────────────────────
// Returns all available permissions grouped by module.
// Used by the Permission Matrix UI to render the grid.
// Any admin can view — employees do not need to access this.
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('id, module_key, action, label, description')
      .order('module_key')
      .order('action');

    if (error) throw error;

    // Group by module_key
    const grouped = {};
    for (const p of data || []) {
      if (!grouped[p.module_key]) {
        grouped[p.module_key] = { module_key: p.module_key, permissions: [] };
      }
      grouped[p.module_key].permissions.push({
        id: p.id, action: p.action, label: p.label, description: p.description,
      });
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/permissions/user/:userId ────────────────────────────────────────
// Returns the effective permission strings for a user within the org.
// Useful for debugging and for the "My Permissions" view.
router.get('/user/:userId', auth, adminOnly, async (req, res) => {
  try {
    const oId    = orgId(req);
    const userId = parseInt(req.params.userId);

    const { resolvePermissions } = require('../../services/permissionService');
    const permissions = await resolvePermissions(userId, oId);
    res.json({ user_id: userId, org_id: oId, permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/permissions/me ──────────────────────────────────────────────────
// Returns the calling user's own effective permissions.
router.get('/me', auth, async (req, res) => {
  try {
    const { resolvePermissions } = require('../../services/permissionService');
    const permissions = await resolvePermissions(req.user.id, req.user.organization_id);
    res.json({ permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
