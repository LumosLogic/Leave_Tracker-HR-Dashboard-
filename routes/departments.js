const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');

// GET /api/departments
router.get('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data, error } = await supabase
      .from('departments')
      .select('*, users!departments_head_user_id_fkey(id, name)')
      .eq('organization_id', oId)
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/departments
router.post('/', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { error } = await supabase.from('departments')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
