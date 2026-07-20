const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');

// GET /api/holidays
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { year } = req.query;
    let q = supabase.from('holidays').select('*').eq('organization_id', oId).order('date');
    if (year) q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/holidays
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, date, type, description, specific_msg } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'Name and date are required' });
    const { data, error } = await supabase.from('holidays')
      .insert({ name, date, type: type || 'public', description: description || '', specific_msg: specific_msg || '', organization_id: oId })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/holidays/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, date, type, description, specific_msg } = req.body;
    const { data, error } = await supabase.from('holidays')
      .update({ name, date, type, description: description || '', specific_msg: specific_msg || '' })
      .eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/holidays/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { error } = await supabase.from('holidays')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/holidays/bulk — import multiple holidays
router.post('/bulk', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { holidays } = req.body;
    if (!Array.isArray(holidays) || holidays.length === 0)
      return res.status(400).json({ error: 'holidays array is required' });
    const rows = holidays.map(h => ({ ...h, organization_id: oId }));
    const { data, error } = await supabase.from('holidays').insert(rows).select();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
