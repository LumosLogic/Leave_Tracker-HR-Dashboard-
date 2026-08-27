const express = require('express');
const router  = express.Router();
const { db } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');

// GET /api/holidays
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { year } = req.query;
    let q = db.from('holidays').select('*').eq('organization_id', oId).order('date');
    if (year) q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/holidays
router.post('/', auth, hasPermission('holidays', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, date, type, description, specific_msg } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'Name and date are required' });

    // Prevent duplicate holiday on same date (causes double-counting in leave calculations)
    const { data: existing } = await db.from('holidays')
      .select('id, name').eq('date', date).eq('organization_id', oId).maybeSingle();
    if (existing) {
      return res.status(409).json({
        error: `A holiday already exists on ${date}: "${existing.name}". Delete or edit it first.`,
        existing_id: existing.id,
      });
    }

    const { data, error } = await db.from('holidays')
      .insert({ name, date, type: type || 'public', description: description || '', specific_msg: specific_msg || '', organization_id: oId })
      .select().single();
    if (error) throw error;

    // Auto-mark attendance as 'holiday' for employees who have no record on this date (fire-and-forget)
    db.from('users').select('id').eq('organization_id', oId).eq('role', 'employee').eq('employee_status', 'active')
      .then(async ({ data: employees }) => {
        if (!employees?.length) return;
        const { data: existing } = await db.from('attendance')
          .select('user_id').eq('date', date).eq('organization_id', oId);
        const markedIds = new Set((existing || []).map(r => r.user_id));
        const toInsert = employees
          .filter(e => !markedIds.has(e.id))
          .map(e => ({ user_id: e.id, organization_id: oId, date, status: 'holiday' }));
        if (toInsert.length) await db.from('attendance').insert(toInsert);
      }).catch(() => {});

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/holidays/:id
router.put('/:id', auth, hasPermission('holidays', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { name, date, type, description, specific_msg } = req.body;
    const { data, error } = await db.from('holidays')
      .update({ name, date, type, description: description || '', specific_msg: specific_msg || '' })
      .eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/holidays/:id
router.delete('/:id', auth, hasPermission('holidays', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { error } = await db.from('holidays')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/holidays/bulk — import multiple holidays
router.post('/bulk', auth, hasPermission('holidays', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { holidays } = req.body;
    if (!Array.isArray(holidays) || holidays.length === 0)
      return res.status(400).json({ error: 'holidays array is required' });
    const rows = holidays.map(h => ({ ...h, organization_id: oId }));
    const { data, error } = await db.from('holidays').insert(rows).select();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
