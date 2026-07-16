const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// GET /api/assets
router.get('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId, status } = req.query;
    let q = supabase.from('assets')
      .select('*, assigned_user:users!assets_assigned_to_fkey(id, name, avatar_color, department)')
      .eq('organization_id', oId)
      .order('created_at', { ascending: false });
    if (userId) q = q.eq('assigned_to', userId);
    if (status)  q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/assets
router.post('/', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const body = { ...req.body, organization_id: oId };
    delete body.id; delete body.created_at;
    const { data, error } = await supabase.from('assets').insert(body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/assets/:id
router.put('/:id', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const body = { ...req.body };
    delete body.id; delete body.created_at; delete body.organization_id;
    const { data, error } = await supabase.from('assets')
      .update(body).eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;

    // Notify employee if assigned
    if (body.assigned_to && body.status === 'assigned') {
      await supabase.from('notifications').insert({
        user_id: body.assigned_to,
        title: 'Asset Assigned',
        message: `${body.name || 'An asset'} (${body.asset_tag || ''}) has been assigned to you.`,
        type: 'asset', organization_id: oId,
      });
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/assets/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { error } = await supabase.from('assets').delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
