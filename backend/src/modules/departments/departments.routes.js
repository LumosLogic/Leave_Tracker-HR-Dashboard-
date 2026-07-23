const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');

// GET /api/departments
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data, error } = await supabase
      .from('departments')
      .select('*, users!departments_head_user_id_fkey(id, name)')
      .eq('organization_id', oId)
      .order('name');
    if (error) throw error;

    // Attach member counts from user_departments junction table
    const deptIds = (data || []).map(d => d.id);
    let memberCounts = {};
    if (deptIds.length > 0) {
      const { data: ud } = await supabase.from('user_departments')
        .select('department_id')
        .in('department_id', deptIds)
        .eq('organization_id', oId);
      (ud || []).forEach(r => {
        memberCounts[r.department_id] = (memberCounts[r.department_id] || 0) + 1;
      });
    }

    res.json((data || []).map(d => ({ ...d, member_count: memberCounts[d.id] || 0 })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/departments
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, description, head_user_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required' });
    const { data, error } = await supabase
      .from('departments')
      .insert({ name, description: description || '', head_user_id: head_user_id || null, organization_id: oId })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/departments/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, description, head_user_id } = req.body;
    const { data, error } = await supabase
      .from('departments')
      .update({ name, description: description || '', head_user_id: head_user_id || null })
      .eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/departments/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { error } = await supabase.from('departments')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
