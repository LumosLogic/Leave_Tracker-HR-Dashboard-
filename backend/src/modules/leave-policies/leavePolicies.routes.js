const express = require('express');
const router  = express.Router();
const { supabase, pool } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');

const DEFAULT_POLICIES = [
  { leave_type: 'annual',    label: 'Annual Leave',    annual_quota: 18, carry_forward: true,  max_carry_forward: 5,  paid: true },
  { leave_type: 'sick',      label: 'Sick Leave',      annual_quota: 12, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'casual',    label: 'Casual Leave',    annual_quota:  8, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'emergency', label: 'Emergency Leave', annual_quota:  3, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'maternity', label: 'Maternity Leave', annual_quota: 180,carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'paternity', label: 'Paternity Leave', annual_quota: 15, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'comp_off',  label: 'Comp Off',        annual_quota:  0, carry_forward: false, max_carry_forward: 0,  paid: true },
];

// GET /api/leave-policies
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data, error } = await supabase.from('leave_policies')
      .select('*').eq('organization_id', oId).order('leave_type');

    // Return defaults if table missing or no rows yet
    if (error || !data || data.length === 0) {
      return res.json(DEFAULT_POLICIES.map(p => ({ ...p, id: null, organization_id: oId, active: true })));
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/leave-policies — atomic replace-all using a PostgreSQL transaction (admin only).
// HIGH-19: DELETE then INSERT must be atomic — if INSERT fails, no policies should be lost.
router.post('/', auth, hasPermission('settings', 'manage'), async (req, res) => {
  const oId = req.user.organization_id;
  const { policies } = req.body;
  if (!Array.isArray(policies) || policies.length === 0)
    return res.status(400).json({ error: 'policies array required and must not be empty' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM leave_policies WHERE organization_id = $1', [oId]);

    const inserted = [];
    for (const p of policies) {
      const { leave_type, label, annual_quota, carry_forward, max_carry_forward, paid, active } = p;
      const result = await client.query(
        `INSERT INTO leave_policies
           (organization_id, leave_type, label, annual_quota, carry_forward, max_carry_forward, paid, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [oId, leave_type, label || leave_type, Number(annual_quota) || 0,
         !!carry_forward, Number(max_carry_forward) || 0, paid !== false, active !== false]
      );
      inserted.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.json(inserted);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/leave-policies/:id (admin only)
router.put('/:id', auth, hasPermission('settings', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const fields = req.body;
    delete fields.id; delete fields.organization_id; delete fields.created_at;
    const { data, error } = await supabase.from('leave_policies')
      .update(fields).eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
