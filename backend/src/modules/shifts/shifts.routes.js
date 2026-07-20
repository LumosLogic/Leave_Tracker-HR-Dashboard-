const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// ─── Shift Definitions ────────────────────────────────────────────────────────

// GET /api/shifts
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data, error } = await supabase.from('shifts').select('*').eq('organization_id', oId).order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shifts
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { name, start_time, end_time, color, description, days_of_week } = req.body;
    if (!name || !start_time || !end_time) return res.status(400).json({ error: 'name, start_time and end_time required' });
    const { data, error } = await supabase.from('shifts')
      .insert({ name, start_time, end_time, color: color || '#3525cd', description: description || '', days_of_week: days_of_week || null, organization_id: oId })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/shifts/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { name, start_time, end_time, color, description, days_of_week } = req.body;
    const { data, error } = await supabase.from('shifts')
      .update({ name, start_time, end_time, color, description: description || '', days_of_week: days_of_week || null })
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/shifts/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { error } = await supabase.from('shifts').delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Shift Assignments ────────────────────────────────────────────────────────

// GET /api/shifts/assignments?month=YYYY-MM
router.get('/assignments', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { month, userId } = req.query;
    let q = supabase.from('shift_assignments')
      .select('*, shift:shifts(id, name, start_time, end_time, color), user:users!shift_assignments_user_id_fkey(id, name, avatar_color, department)')
      .eq('organization_id', oId)
      .order('date');
    if (month) q = q.gte('date', `${month}-01`).lte('date', `${month}-31`);
    if (userId) q = q.eq('user_id', userId);
    else if (!isAdmin(req.user.role)) q = q.eq('user_id', req.user.id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shifts/assignments/bulk — assign shifts to multiple employees
router.post('/assignments/bulk', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) return res.status(400).json({ error: 'assignments array required' });
    const rows = assignments.map(a => ({ ...a, organization_id: oId }));
    const { data, error } = await supabase.from('shift_assignments')
      .upsert(rows, { onConflict: 'user_id,date' }).select();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/shifts/assignments/:id
router.delete('/assignments/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const { error } = await supabase.from('shift_assignments').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
