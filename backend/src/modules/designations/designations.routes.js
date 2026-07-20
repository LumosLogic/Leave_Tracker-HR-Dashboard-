const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');

// GET /api/designations
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { department_id } = req.query;
    let q = supabase.from('designations')
      .select('*, departments(id, name)')
      .eq('organization_id', oId)
      .order('name');
    if (department_id) q = q.eq('department_id', department_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/designations
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, department_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Designation name is required' });
    const { data, error } = await supabase.from('designations')
      .insert({ name, department_id: department_id || null, organization_id: oId })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/designations/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, department_id } = req.body;
    const { data, error } = await supabase.from('designations')
      .update({ name, department_id: department_id || null })
      .eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/designations/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { error } = await supabase.from('designations')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
