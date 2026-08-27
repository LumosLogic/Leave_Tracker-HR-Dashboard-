const express = require('express');
const router  = express.Router();
const { db } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');

// GET /api/designations
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { department_id } = req.query;
    let q = db.from('designations')
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
router.post('/', auth, hasPermission('designations', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, department_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Designation name is required' });
    // BUG_046/051: Prevent duplicate designation names within the same org
    const { data: existing } = await db.from('designations')
      .select('id').eq('organization_id', oId)
      .ilike('name', name.trim())
      .maybeSingle();
    if (existing) return res.status(400).json({ error: `A designation named "${name.trim()}" already exists. Please use a different name.` });
    const { data, error } = await db.from('designations')
      .insert({ name: name.trim(), department_id: department_id || null, organization_id: oId })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: `A designation named "${name.trim()}" already exists.` });
      throw error;
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/designations/:id
router.put('/:id', auth, hasPermission('designations', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, department_id } = req.body;
    if (name) {
      // BUG_046/051: Prevent duplicate designation names on update too
      const { data: existing } = await db.from('designations')
        .select('id').eq('organization_id', oId)
        .ilike('name', name.trim())
        .neq('id', req.params.id)
        .maybeSingle();
      if (existing) return res.status(400).json({ error: `A designation named "${name.trim()}" already exists. Please use a different name.` });
    }
    const { data, error } = await db.from('designations')
      .update({ name: name ? name.trim() : undefined, department_id: department_id || null })
      .eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/designations/:id
router.delete('/:id', auth, hasPermission('designations', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { error } = await db.from('designations')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
